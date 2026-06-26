/**
 * The QA loop behind one command — Proofkeeper's DROID spine.
 *
 * It wires the already-real pieces into a single autonomous pass: pick an
 * unverified capability from the coverage read-model (Initiative 1), drive the
 * product to record a session (Initiative 2), compile it and gate it on
 * fidelity, then run the accepted test (Initiatives 3–4), and — only if it is
 * stable and a proposer is wired — propose the `## Verified By` write-back as a
 * human-reviewed pull request (Initiative 5).
 *
 * The drive is injected as a {@link QaDeps.drive} seam, not constructed here: a
 * browser-backed driver supplies it at the CLI, a scripted double supplies it in
 * tests. That keeps this orchestrator pure of any browser or model dependency
 * and unit-testable end to end.
 */

import type { Graph } from "../coverage/graph.js";
import { computeCoverage, type CapabilityCoverage } from "../coverage/model.js";
import type { Compiler } from "../compiler/types.js";
import { summarizeSession } from "../compiler/summary.js";
import type { Runner, RunTarget } from "../runner/types.js";
import { runAgentLoop, type AgentLoopResult } from "../agent/loop.js";
import type { DriveOptions, DriveResult } from "../agent/drive.js";
import { linksFromResults } from "../writeback/proposal.js";
import type { WriteBackProposer, WriteBackResult } from "../writeback/proposer.js";
import type { LearningStore } from "../learning/store.js";

/**
 * Pick the capability to verify: the named one if given (verified or not — a
 * re-verify is allowed), otherwise the first unverified capability.
 *
 * @throws when a named capability is absent, or when nothing is unverified and
 *   no capability was named.
 */
export function selectCapability(graph: Graph, capabilityId?: string): CapabilityCoverage {
  const report = computeCoverage(graph);
  if (capabilityId) {
    const found = [...report.verified, ...report.unverified].find((c) => c.id === capabilityId);
    if (!found) {
      throw new Error(`capability '${capabilityId}' is not a requirement node in the graph`);
    }
    return found;
  }
  const next = report.unverified[0];
  if (!next) {
    throw new Error("every capability is already verified — nothing to drive");
  }
  return next;
}

/** A default goal derived from the capability, used when the caller gives none. */
export function defaultGoal(capability: CapabilityCoverage): string {
  return (
    `Drive the product to verify the capability "${capability.title}" (${capability.id}). ` +
    "Exercise its primary end-to-end flow and assert every observable outcome."
  );
}

export interface QaDeps {
  /**
   * Drive the product to produce a recorded session. The CLI backs this with a
   * real browser + a {@link ModelClient}; tests back it with a double.
   */
  drive(options: DriveOptions): Promise<DriveResult>;
  compiler: Compiler;
  runner: Runner;
  /** Optional: when present and the test is stable, propose the write-back PR. */
  proposer?: WriteBackProposer;
  /** Optional: remembers failed attempts and feeds prior reasons into the drive. */
  learning?: LearningStore;
}

export interface QaOptions {
  /** Parsed `rac export --graph` output to read coverage from. */
  graph: Graph;
  /** Verify this capability; defaults to the first unverified one. */
  capabilityId?: string;
  /** Product entry point the drive navigates to first. */
  startUrl: string;
  /** Goal for the model; defaults to {@link defaultGoal}. */
  goal?: string;
  /** The target the compiled test is gated and run against. */
  target: RunTarget;
  /** Fidelity re-run count (the moat's acceptance bar). */
  n: number;
  /** Cap on model turns during the drive. */
  maxSteps?: number;
  /** When set, the drive emits a Markdown test plan before acting. */
  plan?: boolean;
  /** When set (and a proposer is wired), propose a Verified By write-back. */
  propose?: { targetPath: string; baseBranch?: string };
}

export interface QaResult {
  capability: CapabilityCoverage;
  drive: DriveResult;
  loop: AgentLoopResult;
  /** True iff the compiled test passed the fidelity gate. */
  verified: boolean;
  /** Present only when a write-back was attempted (stable + proposer + propose). */
  writeBack?: WriteBackResult;
}

/**
 * Run the full QA loop for one capability: select → drive → compile → fidelity →
 * run → (optional) propose. Returns the outcome; never throws on an unstable
 * test (that is a verdict, surfaced in {@link QaResult.verified}).
 */
export async function runQa(deps: QaDeps, options: QaOptions): Promise<QaResult> {
  const capability = selectCapability(options.graph, options.capabilityId);
  const goal = options.goal ?? defaultGoal(capability);

  // Feed reasons from earlier failed attempts into the drive (failure-learning).
  const prior = deps.learning ? await deps.learning.priorFailures(capability.id) : [];

  const driveOptions: DriveOptions = {
    capabilityId: capability.id,
    title: `verify ${capability.title}`,
    startUrl: options.startUrl,
    goal,
    ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
    ...(prior.length > 0 ? { priorFailures: prior.map((f) => f.reason) } : {}),
    ...(options.plan ? { plan: true } : {}),
  };
  const drive = await deps.drive(driveOptions);

  const loop = await runAgentLoop(
    { compiler: deps.compiler, runner: deps.runner },
    {
      session: drive.session,
      fidelity: { n: options.n, target: options.target },
      runTargets: [options.target],
    },
  );

  const verified = loop.verdict.stable;
  const result: QaResult = { capability, drive, loop, verified };

  // Propose the write-back only for a stable test (ADR-065: a human reviews it).
  // The proposal carries the readable step summary so a reviewer can read the
  // driven flow without opening the trace.
  if (verified && deps.proposer && options.propose) {
    result.writeBack = await deps.proposer.propose({
      capabilityId: capability.id,
      targetPath: options.propose.targetPath,
      links: linksFromResults(loop.candidate, loop.runResults),
      steps: summarizeSession(drive.session),
      ...(drive.session.plan !== undefined ? { plan: drive.session.plan } : {}),
      ...(options.propose.baseBranch !== undefined ? { baseBranch: options.propose.baseBranch } : {}),
      fidelity: {
        attempts: loop.verdict.attempts,
        passed: loop.verdict.passed,
        stable: loop.verdict.stable,
      },
    });
  }

  // Remember a failure so the next attempt avoids it (failure-learning).
  if (deps.learning && (!verified || !drive.finished)) {
    await deps.learning.recordFailure({
      capabilityId: capability.id,
      goal,
      reason: !drive.finished
        ? `drive did not finish within the step budget (${drive.steps} steps)`
        : `compiled test was unstable: ${loop.verdict.passed}/${loop.verdict.attempts} re-runs green`,
      steps: drive.steps,
    });
  }

  return result;
}
