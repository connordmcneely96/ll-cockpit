import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the rewriter so the useRewriter path is deterministic (one variant → one query).
vi.mock("./rewriter", () => ({
  rewriteQuery: vi.fn(async () => ["variant one"]),
}));

import { retrieve, RetrieveEnv } from "./retrieve";

// A test env that records every filter passed to ATLAS_RAG.query and returns no matches.
function makeEnv() {
  const filters: unknown[] = [];
  const vec = new Array(1024).fill(0);
  const env: RetrieveEnv = {
    AI: {
      // Embed calls pass { text: [...] }; return one vector per text.
      run: vi.fn(async (_model: string, opts: { text?: string[] }) => ({
        data: (opts.text ?? [""]).map(() => vec),
      })),
    } as unknown as RetrieveEnv["AI"],
    ATLAS_RAG: {
      query: vi.fn(async (_v: number[], opts: { filter?: unknown }) => {
        filters.push(opts.filter);
        return { matches: [] };
      }),
    } as unknown as RetrieveEnv["ATLAS_RAG"],
  };
  return { env, filters };
}

describe("retrieve() tenant filter — single tenant (unchanged behavior)", () => {
  let ctx: ReturnType<typeof makeEnv>;
  beforeEach(() => { ctx = makeEnv(); });

  it("no libraryTenantIds → exact old shape { tenant_id: 'T' }", async () => {
    await retrieve(ctx.env, "q", "T", { useRewriter: false });
    expect(ctx.filters[0]).toEqual({ tenant_id: "T" });
  });

  it("libraryTenantIds: [] → old shape (empty = single-tenant)", async () => {
    await retrieve(ctx.env, "q", "T", { useRewriter: false, libraryTenantIds: [] });
    expect(ctx.filters[0]).toEqual({ tenant_id: "T" });
  });
});

describe("retrieve() tenant filter — unioned libraries", () => {
  let ctx: ReturnType<typeof makeEnv>;
  beforeEach(() => { ctx = makeEnv(); });

  it("one library → { tenant_id: { $in: ['T','library:standards'] } } (caller first)", async () => {
    await retrieve(ctx.env, "q", "T", { useRewriter: false, libraryTenantIds: ["library:standards"] });
    expect(ctx.filters[0]).toEqual({ tenant_id: { $in: ["T", "library:standards"] } });
  });

  it("two libraries → { tenant_id: { $in: ['T','a','b'] } }", async () => {
    await retrieve(ctx.env, "q", "T", { useRewriter: false, libraryTenantIds: ["a", "b"] });
    expect(ctx.filters[0]).toEqual({ tenant_id: { $in: ["T", "a", "b"] } });
  });
});

describe("retrieve() tenant filter — same shape on both paths", () => {
  it("useRewriter:false and useRewriter:true build the identical filter", async () => {
    const opts = { libraryTenantIds: ["library:standards"] };
    const expected = { tenant_id: { $in: ["T", "library:standards"] } };

    const noRw = makeEnv();
    await retrieve(noRw.env, "q", "T", { ...opts, useRewriter: false });
    expect(noRw.filters[0]).toEqual(expected);

    const rw = makeEnv();
    await retrieve(rw.env, "q", "T", { ...opts, useRewriter: true });
    // Every query on the rewriter path uses the same unioned filter.
    expect(rw.filters.length).toBeGreaterThan(0);
    for (const f of rw.filters) expect(f).toEqual(expected);
  });
});
