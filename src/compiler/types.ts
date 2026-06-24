/**
 * The session→test compiler interface — Proofkeeper Initiative 2.
 *
 * THIS IS THE MOAT. Faithfully compiling a real, exploratory agent session
 * into a durable, deterministic Playwright test — and proving it stable — is
 * the hard, differentiating problem. In v0.0.1 this is an interface plus a
 * `NotImplemented` stub; the real compiler is deferred (see README scope).
 */

import type { CompiledTest } from "../runner/types.js";

/** A single recorded interaction during an agent's drive of a product. */
export interface SessionStep {
  /** e.g. "navigate", "click", "fill", "expect" — the action kind. */
  kind: string;
  /** A target selector / URL / locator the action applied to. */
  target?: string;
  /** Action payload (typed text, expected value, …). */
  value?: string;
  /** Free-form notes the agent attached (reasoning, observations). */
  note?: string;
}

/** A recorded working session: the raw material the compiler turns into a test. */
export interface Session {
  /** Identifier for the capability/feature this session exercised. */
  capabilityId?: string;
  /** The product entry point the session started from. */
  startUrl: string;
  steps: SessionStep[];
}

/** A test the compiler emitted from a session — a candidate, not yet trusted. */
export interface CandidateTest extends CompiledTest {
  /** The session this test was compiled from. */
  fromSession: Session;
}

/**
 * Compiles a recorded {@link Session} into a candidate Playwright test.
 *
 * The output is a *candidate*: it has not yet passed the fidelity gate
 * (Initiative 3) and must not be trusted until it has.
 */
export interface Compiler {
  compile(session: Session): Promise<CandidateTest>;
}
