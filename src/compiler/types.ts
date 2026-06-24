/**
 * The session→test compiler interface — Proofkeeper Initiative 2 (the moat).
 *
 * Faithfully compiling a real drive session into a durable, deterministic
 * Playwright test — and proving it stable — is the hard, differentiating
 * problem. The compiler reduces a {@link RecordedSession} (the authoritative
 * recorded-action trace) to a candidate test.
 */

import type { RecordedSession } from "./actions.js";
import type { CompiledTest } from "../runner/types.js";

/** A test the compiler emitted from a session — a candidate, not yet trusted. */
export interface CandidateTest extends CompiledTest {
  /** The recorded session this test was compiled from. */
  fromSession: RecordedSession;
}

/**
 * Compiles a {@link RecordedSession} into a candidate Playwright test.
 *
 * The output is a *candidate*: it has not yet passed the fidelity gate
 * (Initiative 3) and must not be trusted until it has.
 */
export interface Compiler {
  compile(session: RecordedSession): Promise<CandidateTest>;
}
