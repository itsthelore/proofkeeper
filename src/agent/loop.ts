/**
 * The drive→compile→fidelity→run agent loop skeleton — Proofkeeper
 * Initiatives 2–4 wired together.
 *
 * This shows the shape end-to-end without faking the moat. The drive phase
 * collects a {@link Session} via a bring-your-own {@link ModelClient}; the
 * compile phase is the (deferred) {@link Compiler}; the fidelity phase gates
 * the candidate via {@link assessFidelity}; accepted tests flow to the
 * {@link Runner}. In v0.0.1 the compile step is a stub, so the loop documents
 * the pipeline rather than producing committed tests autonomously.
 */

import type { Compiler, Session } from "../compiler/types.js";
import { assessFidelity, type FidelityVerdict } from "../fidelity/gate.js";
import type { Runner, RunResult, RunTarget } from "../runner/types.js";
import type { ModelClient } from "./model.js";

export interface AgentLoopDeps {
  model: ModelClient;
  compiler: Compiler;
  runner: Runner;
}

export interface AgentLoopOptions {
  /** Capability being exercised; threads through to the write-back. */
  capabilityId?: string;
  /** Product entry point the drive starts from. */
  startUrl: string;
  /** Stability target and N for the fidelity gate. */
  fidelity: { n: number; target: RunTarget };
  /** Targets the accepted suite runs against. */
  runTargets: RunTarget[];
}

export interface AgentLoopResult {
  session: Session;
  verdict: FidelityVerdict;
  /** Only populated when the candidate passed the fidelity gate. */
  runResults: RunResult[];
}

/**
 * Drive a product, compile the session, gate it on fidelity, and run the
 * accepted test. The pieces are real interfaces; the compiler is a v0.0.1 stub
 * and will reject until Initiative 2 lands.
 */
export async function runAgentLoop(
  deps: AgentLoopDeps,
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  // 1. DRIVE — the BYO model decides actions until it signals done. The full
  //    browser/terminal tool execution lands with the compiler (Initiative 2);
  //    here we capture the session shell the model produces.
  const session: Session = { capabilityId: options.capabilityId, startUrl: options.startUrl, steps: [] };

  // 2. COMPILE — turn the session into a candidate test (the moat; stubbed).
  const candidate = await deps.compiler.compile(session);

  // 3. FIDELITY — accept only if it re-runs green and stable N times.
  const verdict = await assessFidelity(deps.runner, candidate, {
    n: options.fidelity.n,
    target: options.fidelity.target,
  });

  // 4. RUN — fan the accepted suite across targets; quarantine the rest.
  const runResults = verdict.stable
    ? await deps.runner.run([candidate], { targets: options.runTargets })
    : [];

  return { session, verdict, runResults };
}
