/**
 * Public API for @itsthelore/proofkeeper.
 *
 * The coverage read-model is the working v0.0.1 surface; the runner, compiler,
 * fidelity gate, agent loop, and write-back are interfaces and skeletons that
 * fix the drive→compile→fidelity→run→write-back shape (see README scope).
 */

// Coverage read-model (Initiative 1) — the working surface.
export { parseGraph, GraphParseError, VERIFIED_BY } from "./coverage/graph.js";
export type { Graph, GraphNode, GraphEdge } from "./coverage/graph.js";
export { computeCoverage, CAPABILITY_TYPE } from "./coverage/model.js";
export type { CoverageReport, CapabilityCoverage } from "./coverage/model.js";
export { renderHuman, renderJson, toJson } from "./coverage/report.js";
export type { CoverageJson } from "./coverage/report.js";
export { loadGraphFromFile, loadGraphFromCorpus } from "./coverage/source.js";

// Runner (Initiative 4).
export type {
  Runner,
  RunResult,
  RunOptions,
  RunStatus,
  RunTarget,
  CompiledTest,
} from "./runner/types.js";
export { PlaywrightRunner } from "./runner/playwright-runner.js";
export type { PlaywrightRunnerOptions } from "./runner/playwright-runner.js";
export { parseReport, reduceReport, ReportParseError } from "./runner/playwright-report.js";

// Compiler (Initiative 2 — the moat; stubbed).
export type { Compiler, Session, SessionStep, CandidateTest } from "./compiler/types.js";
export { NotImplementedCompiler } from "./compiler/compiler.js";

// Fidelity gate (Initiative 3 — the moat's acceptance bar).
export { assessFidelity } from "./fidelity/gate.js";
export type { FidelityOptions, FidelityVerdict } from "./fidelity/gate.js";

// Agent loop (Initiatives 2–4 wired) and the BYO-model boundary.
export { runAgentLoop } from "./agent/loop.js";
export type { AgentLoopDeps, AgentLoopOptions, AgentLoopResult } from "./agent/loop.js";
export type { ModelClient, ModelRequest, ModelResponse, ToolCall } from "./agent/model.js";

// Write-back (Initiative 5 — propose-only).
export {
  renderVerifiedBySection,
  proposeVerifiedBy,
  VERIFIED_BY_HEADING,
} from "./writeback/verified-by.js";
export type { VerificationLink, VerifiedByProposal } from "./writeback/verified-by.js";
