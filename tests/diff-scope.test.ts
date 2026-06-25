import { describe, expect, it } from "vitest";

import { globToRegExp, matchesAnyGlob } from "../src/scope/glob.js";
import { scopeCapabilities } from "../src/scope/diff-scope.js";
import type { ProofkeeperConfig } from "../src/scope/config.js";
import type { Graph } from "../src/coverage/graph.js";

describe("globToRegExp", () => {
  it("matches within a segment with * but not across /", () => {
    expect(globToRegExp("api/*.ts").test("api/checkout.ts")).toBe(true);
    expect(globToRegExp("api/*.ts").test("api/sub/checkout.ts")).toBe(false);
  });

  it("matches across segments with ** including a trailing /**", () => {
    expect(globToRegExp("src/checkout/**").test("src/checkout/pay.ts")).toBe(true);
    expect(globToRegExp("src/checkout/**").test("src/cart/pay.ts")).toBe(false);
  });

  it("matches zero or more leading directories with **/", () => {
    const re = globToRegExp("**/*.spec.ts");
    expect(re.test("a.spec.ts")).toBe(true);
    expect(re.test("tests/x.spec.ts")).toBe(true);
    expect(re.test("a.ts")).toBe(false);
  });

  it("matches a single character with ? and escapes regex specials", () => {
    expect(globToRegExp("a?c").test("abc")).toBe(true);
    expect(globToRegExp("a?c").test("a/c")).toBe(false);
    expect(globToRegExp("a.b").test("a.b")).toBe(true);
    expect(globToRegExp("a.b").test("axb")).toBe(false);
  });

  it("matchesAnyGlob is true when any pattern matches", () => {
    expect(matchesAnyGlob("src/x.ts", ["docs/**", "src/*.ts"])).toBe(true);
    expect(matchesAnyGlob("README.md", ["docs/**", "src/*.ts"])).toBe(false);
  });
});

const GRAPH: Graph = {
  schema_version: "1",
  source: "demo",
  nodes: [
    { id: "REQ-A", type: "requirement", status: "Accepted", title: "Alpha" },
    { id: "REQ-B", type: "requirement", status: "Accepted", title: "Beta" },
  ],
  edges: [{ source: "REQ-A", target: "tests/a.spec.ts", type: "verified_by", directed: true, resolved: false }],
};

const CONFIG: ProofkeeperConfig = {
  capabilities: [
    { id: "REQ-A", paths: ["src/a/**"] },
    { id: "REQ-B", paths: ["src/b/**"] },
    { id: "REQ-Q", paths: ["src/q/**"] }, // not a node in the graph
  ],
};

describe("scopeCapabilities", () => {
  it("scopes capabilities whose source paths intersect the diff", () => {
    const r = scopeCapabilities(["src/b/pay.ts"], CONFIG, GRAPH);
    expect(r.scoped.map((s) => s.id)).toEqual(["REQ-B"]);
    expect(r.toVerify.map((s) => s.id)).toEqual(["REQ-B"]);
    expect(r.scoped[0]?.matchedPaths).toEqual(["src/b/pay.ts"]);
  });

  it("separates already-verified capabilities from those to verify", () => {
    const r = scopeCapabilities(["src/a/x.ts", "src/b/y.ts"], CONFIG, GRAPH);
    expect(r.scoped.map((s) => s.id).sort()).toEqual(["REQ-A", "REQ-B"]);
    expect(r.toVerify.map((s) => s.id)).toEqual(["REQ-B"]); // REQ-A already verified
  });

  it("reports config ids that match the diff but are not capability nodes", () => {
    const r = scopeCapabilities(["src/q/z.ts"], CONFIG, GRAPH);
    expect(r.scoped).toEqual([]);
    expect(r.unknown).toEqual(["REQ-Q"]);
  });

  it("returns nothing when no changed path matches", () => {
    const r = scopeCapabilities(["docs/readme.md"], CONFIG, GRAPH);
    expect(r.scoped).toEqual([]);
    expect(r.toVerify).toEqual([]);
    expect(r.unknown).toEqual([]);
  });
});
