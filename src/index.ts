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

// Compiler (Initiative 2 — the moat).
export type { Action, Locator, RecordedSession } from "./compiler/actions.js";
export { emitSpec } from "./compiler/emit.js";
export { Recorder } from "./compiler/recorder.js";
export type { RecorderOptions } from "./compiler/recorder.js";
export type { Compiler, CandidateTest } from "./compiler/types.js";
export { CodegenCompiler, NotImplementedCompiler } from "./compiler/compiler.js";
export type { CodegenCompilerOptions } from "./compiler/compiler.js";
export { runCommand, evalOutputMatch } from "./compiler/terminal.js";
export type { CommandResult, OutputAssertion } from "./compiler/terminal.js";

// Fidelity gate (Initiative 3 — the moat's acceptance bar).
export { assessFidelity } from "./fidelity/gate.js";
export type { FidelityOptions, FidelityVerdict } from "./fidelity/gate.js";

// The QA loop behind one command — the DROID spine (Initiatives 1–5 wired).
export { runQa, selectCapability, defaultGoal } from "./qa/run-qa.js";
export type { QaDeps, QaOptions, QaResult } from "./qa/run-qa.js";

// PR-triggered, diff-scoped QA.
export { runScopedQa } from "./qa/run-scoped.js";
export type { ScopedQaOptions, ScopedQaResult, ScopedCapabilityResult } from "./qa/run-scoped.js";
export { scopeCapabilities } from "./scope/diff-scope.js";
export type { ScopeResult, ScopedCapability } from "./scope/diff-scope.js";
export { parseConfig, ConfigParseError } from "./scope/config.js";
export type { ProofkeeperConfig, CapabilityConfig } from "./scope/config.js";
export { globToRegExp, matchesAnyGlob } from "./scope/glob.js";

// Agent loop (Initiatives 2–4 wired) and the BYO-model boundary.
export { runAgentLoop } from "./agent/loop.js";
export type { AgentLoopDeps, AgentLoopOptions, AgentLoopResult } from "./agent/loop.js";
export type { ModelClient, ModelRequest, ModelResponse, ToolCall } from "./agent/model.js";
export { AutonomousDriver, runDrive } from "./agent/drive.js";
export type { DriveOptions, DriveResult } from "./agent/drive.js";
export {
  DRIVE_TOOLS,
  LOCATOR_GUIDANCE,
  TERMINAL_GUIDANCE,
  parseLocator,
  parseRunCommand,
  parseExpectOutput,
  parseExpectExit,
  ToolArgumentError,
} from "./agent/tools.js";
export type { DriveTool, RunCommandArgs, OutputAssertionArgs } from "./agent/tools.js";
export { observePage, renderObservation } from "./agent/observe.js";
export type { PageObservation } from "./agent/observe.js";

// Reference BYO-model adapter (optional — Anthropic Claude API).
export {
  ClaudeModelClient,
  DEFAULT_CLAUDE_MODEL,
  toAnthropicMessages,
  toAnthropicTools,
  fromAnthropicResponse,
} from "./agent/adapters/claude.js";
export type { ClaudeModelClientOptions, AnthropicLike } from "./agent/adapters/claude.js";

// Write-back (Initiative 5 — propose-only, human-reviewed PR).
export {
  renderVerifiedBySection,
  renderVerifiedByItem,
  verificationRefs,
  proposeVerifiedBy,
  VERIFIED_BY_HEADING,
} from "./writeback/verified-by.js";
export type { VerificationLink, VerifiedByProposal } from "./writeback/verified-by.js";
export { mergeVerifiedBy } from "./writeback/merge.js";
export { buildProposal, linksFromResults } from "./writeback/proposal.js";
export type { BuildProposalInput, WriteBackProposal } from "./writeback/proposal.js";
export { renderWriteBackComment, renderCoverageComment, renderScopedQaComment, commentCoverageStatus } from "./writeback/comment.js";
export type { FidelitySummary, CoverageCommentOptions, ScopedQaCommentInput, ScopedQaCommentRow } from "./writeback/comment.js";
export { GitHubWriteBackProposer } from "./writeback/proposer.js";
export type {
  RepoGateway,
  WriteBackProposer,
  WriteBackInput,
  WriteBackResult,
  GitHubWriteBackProposerOptions,
} from "./writeback/proposer.js";
export { GitHubRestGateway } from "./writeback/gateways/github-rest.js";
export type { GitHubRestGatewayOptions } from "./writeback/gateways/github-rest.js";
