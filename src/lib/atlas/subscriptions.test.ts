import { describe, it, expect, vi } from "vitest";
import {
  resolveSubscribedLibraries,
  isSubscribableLibrary,
  listSubscribableLibraries,
  subscribe,
} from "./subscriptions";

// Richer fake D1 supporting first()/all()/run(); records every prepared SQL string so we
// can assert whether (and which) query was issued.
function makeRichDb(h: {
  first?: () => Promise<unknown>;
  all?: () => Promise<{ results?: unknown[] }>;
  run?: () => Promise<unknown>;
} = {}) {
  const sqls: string[] = [];
  const methods = () => ({
    first: h.first ?? (async () => null),
    all: h.all ?? (async () => ({ results: [] })),
    run: h.run ?? (async () => ({})),
  });
  const prepare = vi.fn((sql: string) => {
    sqls.push(sql);
    // Statements may be executed with or without .bind() — expose the methods both ways.
    return { bind: vi.fn(() => methods()), ...methods() };
  });
  return { db: { prepare } as unknown as D1Database, prepare, sqls };
}

// Build a fake D1 whose prepare().bind().all() resolves/rejects as configured, and record
// whether a query was issued so we can assert the empty-tenant short-circuit.
function makeDb(allImpl: () => Promise<{ results?: { library_tenant_id: string }[] }>) {
  const prepare = vi.fn(() => ({
    bind: vi.fn(() => ({ all: allImpl })),
  }));
  return { db: { prepare } as unknown as D1Database, prepare };
}

describe("resolveSubscribedLibraries", () => {
  it("returns the subscribed library ids", async () => {
    const { db } = makeDb(async () => ({
      results: [{ library_tenant_id: "libA" }, { library_tenant_id: "libB" }],
    }));
    expect(await resolveSubscribedLibraries(db, "T")).toEqual(["libA", "libB"]);
  });

  it("returns [] when there are no rows", async () => {
    const { db } = makeDb(async () => ({ results: [] }));
    expect(await resolveSubscribedLibraries(db, "T")).toEqual([]);
  });

  it("empty tenantId → [] and issues no query", async () => {
    const { db, prepare } = makeDb(async () => ({ results: [{ library_tenant_id: "libA" }] }));
    expect(await resolveSubscribedLibraries(db, "")).toEqual([]);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("FAIL-CLOSED: a query error yields [] and never throws", async () => {
    const { db } = makeDb(async () => { throw new Error("d1 down"); });
    await expect(resolveSubscribedLibraries(db, "T")).resolves.toEqual([]);
  });
});

describe("isSubscribableLibrary", () => {
  it("library-prefixed id with an existing doc row → true", async () => {
    const { db } = makeRichDb({ first: async () => ({ 1: 1 }) });
    expect(await isSubscribableLibrary(db, "library:standards")).toBe(true);
  });

  it("library-prefixed id with NO doc row → false", async () => {
    const { db } = makeRichDb({ first: async () => null });
    expect(await isSubscribableLibrary(db, "library:standards")).toBe(false);
  });

  it("BREACH GUARD: a uuid tenant id → false WITHOUT querying the DB", async () => {
    const { db, prepare } = makeRichDb({ first: async () => ({ 1: 1 }) });
    expect(await isSubscribableLibrary(db, "3f2a9c1e-0000-4000-8000-000000000000")).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("FAIL-CLOSED: db throws → false", async () => {
    const { db } = makeRichDb({ first: async () => { throw new Error("d1 down"); } });
    expect(await isSubscribableLibrary(db, "library:standards")).toBe(false);
  });
});

describe("listSubscribableLibraries", () => {
  it("maps rows to { library_tenant_id, doc_count }", async () => {
    const { db } = makeRichDb({
      all: async () => ({ results: [{ library_tenant_id: "library:standards", doc_count: 14 }] }),
    });
    expect(await listSubscribableLibraries(db)).toEqual([
      { library_tenant_id: "library:standards", doc_count: 14 },
    ]);
  });

  it("FAIL-CLOSED: db throws → []", async () => {
    const { db } = makeRichDb({ all: async () => { throw new Error("d1 down"); } });
    expect(await listSubscribableLibraries(db)).toEqual([]);
  });
});

describe("subscribe", () => {
  it("unresolved tenant → tenant_unresolved, no query issued", async () => {
    const { db, prepare } = makeRichDb({ first: async () => ({ 1: 1 }) });
    expect(await subscribe(db, "", "library:standards")).toEqual({ ok: false, reason: "tenant_unresolved" });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("non-library target → not_a_subscribable_library, NO insert issued", async () => {
    const { db, sqls } = makeRichDb({ first: async () => ({ 1: 1 }) });
    expect(await subscribe(db, "T", "3f2a9c1e-uuid")).toEqual({ ok: false, reason: "not_a_subscribable_library" });
    expect(sqls.some((s) => /INSERT/i.test(s))).toBe(false);
  });

  it("happy path → ok, insert issued", async () => {
    const { db, sqls } = makeRichDb({ first: async () => ({ 1: 1 }), run: async () => ({}) });
    expect(await subscribe(db, "T", "library:standards")).toEqual({ ok: true });
    expect(sqls.some((s) => /INSERT OR IGNORE INTO tenant_library_subscriptions/i.test(s))).toBe(true);
  });

  it("FAIL-CLOSED: insert throws → write_failed", async () => {
    const { db } = makeRichDb({ first: async () => ({ 1: 1 }), run: async () => { throw new Error("d1 down"); } });
    expect(await subscribe(db, "T", "library:standards")).toEqual({ ok: false, reason: "write_failed" });
  });
});
