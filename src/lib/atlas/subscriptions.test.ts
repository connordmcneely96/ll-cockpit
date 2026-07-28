import { describe, it, expect, vi } from "vitest";
import { resolveSubscribedLibraries } from "./subscriptions";

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
