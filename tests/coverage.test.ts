import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseGraph, GraphParseError } from "../src/coverage/graph.js";
import { computeCoverage } from "../src/coverage/model.js";
import { renderHuman, toJson } from "../src/coverage/report.js";
import { loadGraphFromFile } from "../src/coverage/source.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

describe("parseGraph", () => {
  it("parses a well-formed graph export", () => {
    const graph = parseGraph(
      JSON.stringify({
        schema_version: "1",
        source: "x",
        nodes: [{ id: "REQ-1", type: "requirement", status: "Accepted", title: "t" }],
        edges: [],
      }),
    );
    expect(graph.nodes).toHaveLength(1);
    expect(graph.source).toBe("x");
  });

  it("ignores additive unknown fields (JSON contract stability)", () => {
    const graph = parseGraph(
      JSON.stringify({
        source: "x",
        nodes: [{ id: "REQ-1", type: "requirement", status: "Accepted", title: "t", extra: 9 }],
        edges: [{ source: "REQ-1", target: "p", type: "verified_by", directed: true, resolved: false, extra: 1 }],
      }),
    );
    expect(graph.edges[0]?.type).toBe("verified_by");
  });

  it("rejects non-JSON input", () => {
    expect(() => parseGraph("not json")).toThrow(GraphParseError);
  });

  it("rejects a graph missing the nodes array", () => {
    expect(() => parseGraph(JSON.stringify({ edges: [] }))).toThrow(/missing a `nodes` array/);
  });

  it("rejects a graph missing the edges array", () => {
    expect(() => parseGraph(JSON.stringify({ nodes: [] }))).toThrow(/missing an `edges` array/);
  });

  it("rejects an unsupported schema_version", () => {
    expect(() =>
      parseGraph(JSON.stringify({ schema_version: "2", source: "x", nodes: [], edges: [] })),
    ).toThrow(/unsupported rac graph schema_version '2'/);
  });

  it("tolerates a graph that omits schema_version", () => {
    const graph = parseGraph(JSON.stringify({ source: "x", nodes: [], edges: [] }));
    expect(graph.schema_version).toBe("");
  });
});

describe("computeCoverage", () => {
  it("separates verified from unverified capabilities", async () => {
    const graph = await loadGraphFromFile(fixture("graph-mixed.json"));
    const report = computeCoverage(graph);

    expect(report.total).toBe(3); // only requirement nodes count
    expect(report.verified.map((c) => c.id).sort()).toEqual(["REQ-EXPORT", "REQ-LOGIN"]);
    expect(report.unverified.map((c) => c.id)).toEqual(["REQ-SEARCH"]);
  });

  it("collects multiple external verified_by targets per capability", async () => {
    const graph = await loadGraphFromFile(fixture("graph-mixed.json"));
    const report = computeCoverage(graph);
    const login = report.verified.find((c) => c.id === "REQ-LOGIN");
    expect(login?.verifiedBy).toEqual(["tests/e2e/login.spec.ts", "traces/login.zip"]);
  });

  it("does not treat non-verified_by edges as coverage", async () => {
    // REQ-LOGIN has a related_decisions edge; it must not count as verification.
    const graph = await loadGraphFromFile(fixture("graph-mixed.json"));
    const report = computeCoverage(graph);
    const login = report.verified.find((c) => c.id === "REQ-LOGIN");
    expect(login?.verifiedBy).not.toContain("RAC-DECISION1");
  });

  it("treats only requirement nodes as capabilities", async () => {
    const graph = await loadGraphFromFile(fixture("graph-mixed.json"));
    const report = computeCoverage(graph);
    const ids = [...report.verified, ...report.unverified].map((c) => c.id);
    expect(ids).not.toContain("RAC-DECISION1");
    expect(ids).not.toContain("roadmap-v1");
  });

  it("reports zero capabilities when the corpus has no requirements", async () => {
    const graph = await loadGraphFromFile(fixture("graph-no-capabilities.json"));
    const report = computeCoverage(graph);
    expect(report.total).toBe(0);
    expect(report.unverified).toHaveLength(0);
  });

  it("reports all verified when every capability has a verified_by edge", async () => {
    const graph = await loadGraphFromFile(fixture("graph-all-verified.json"));
    const report = computeCoverage(graph);
    expect(report.unverified).toHaveLength(0);
    expect(report.verified).toHaveLength(2);
  });

  it("is deterministic and sorts capabilities by id", () => {
    const graph = parseGraph(
      JSON.stringify({
        source: "s",
        nodes: [
          { id: "REQ-Z", type: "requirement", status: "Accepted", title: "z" },
          { id: "REQ-A", type: "requirement", status: "Accepted", title: "a" },
        ],
        edges: [],
      }),
    );
    const report = computeCoverage(graph);
    expect(report.unverified.map((c) => c.id)).toEqual(["REQ-A", "REQ-Z"]);
  });
});

describe("report rendering", () => {
  it("emits a stable JSON contract", async () => {
    const graph = await loadGraphFromFile(fixture("graph-mixed.json"));
    const json = toJson(computeCoverage(graph));
    expect(json).toEqual({
      schema_version: "1",
      source: "demo-corpus",
      total: 3,
      verified: 2,
      unverified: [{ id: "REQ-SEARCH", title: "User can search artifacts", status: "Proposed" }],
      verifiedDetail: [
        { id: "REQ-EXPORT", targets: ["tests/e2e/export.spec.ts"] },
        { id: "REQ-LOGIN", targets: ["tests/e2e/login.spec.ts", "traces/login.zip"] },
      ],
    });
  });

  it("renders a human summary naming the unverified capability", async () => {
    const graph = await loadGraphFromFile(fixture("graph-mixed.json"));
    const text = renderHuman(computeCoverage(graph));
    expect(text).toContain("2/3 capabilities verified, 1 unverified.");
    expect(text).toContain("REQ-SEARCH");
  });

  it("states clearly when there are no capabilities", async () => {
    const graph = await loadGraphFromFile(fixture("graph-no-capabilities.json"));
    const text = renderHuman(computeCoverage(graph));
    expect(text).toContain("No capabilities");
  });
});
