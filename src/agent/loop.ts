/**
 * The compile→fidelity→run pipeline — Proofkeeper Initiatives 2–4 wired.
 *
 * The DRIVE phase (a BYO-model agent calling the {@link Recorder} to produce a
 * {@link RecordedSession}) is upstream and supplied by the caller; this keeps
 * the loop honest about what is autonomous today and what is not. Given a
 * recorded session, the loop compiles it ({@link Compiler}), gates the
 * candidate on fidelity ({@link assessFidelity}), and runs the accepted test
 * across targets ({@link Runner}).
 */

import type { RecordedSession } from "../compiler/actions.js";
import type { CandidateTest, Compiler } from "../compiler/types.js";
import { assessFidelity, type FidelityVerdict } from "../fidelity/gate.js";
import type { Runner, RunResult, RunTarget } from "../runner/types.js";

export interface AgentLoopDeps {
  compiler: Compiler;
  runner: Runner;
}

export interface AgentLoopOptions {
  /** The recorded drive session to compile (produced upstream by a Recorder). */
  session: RecordedSession;
  /** Stability target and N for the fidelity gate. */
  fidelity: { n: number; target: RunTarget };
  /** Targets the accepted suite runs against. */
  runTargets: RunTarget[];
}

export interface AgentLoopResult {
  candidate: CandidateTest;
  verdict: FidelityVerdict;
  /** Only populated when the candidate passed the fidelity gate. */
  runResults: RunResult[];
}

/**
 * Compile a recorded session, gate it on fidelity, and run the accepted test.
 */
export async function runAgentLoop(
  deps: AgentLoopDeps,
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  // 1. COMPILE — reduce the recorded session to a candidate test (the moat).
  const candidate = await deps.compiler.compile(options.session);

  // 2. FIDELITY — accept only if it re-runs green and stable N times.
  const verdict = await assessFidelity(deps.runner, candidate, {
    n: options.fidelity.n,
    target: options.fidelity.target,
  });

  // 3. RUN — fan the accepted test across targets; quarantine if unstable.
  const runResults = verdict.stable
    ? await deps.runner.run([candidate], { targets: options.runTargets })
    : [];

  return { candidate, verdict, runResults };
}
