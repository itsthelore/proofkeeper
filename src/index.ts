/**
 * Public API for @itsthelore/proofkeeper.
 *
 * v0.0.1's working surface is the coverage read-model (Initiative 1). The
 * runner, compiler, fidelity gate, agent loop, and write-back interfaces are
 * added alongside their skeletons.
 */

// Coverage read-model (Initiative 1) — the working surface.
export { parseGraph, GraphParseError, VERIFIED_BY } from "./coverage/graph.js";
export type { Graph, GraphNode, GraphEdge } from "./coverage/graph.js";
export { computeCoverage, CAPABILITY_TYPE } from "./coverage/model.js";
export type { CoverageReport, CapabilityCoverage } from "./coverage/model.js";
export { renderHuman, renderJson, toJson } from "./coverage/report.js";
export type { CoverageJson } from "./coverage/report.js";
export { loadGraphFromFile, loadGraphFromCorpus } from "./coverage/source.js";
