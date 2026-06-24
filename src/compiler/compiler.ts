/**
 * The session→test compiler stub — Proofkeeper Initiative 2 (the moat).
 *
 * Deferred past v0.0.1 on purpose. Faithful session→test compilation is the
 * load-bearing technical bet; shipping a fake would undermine the whole trust
 * premise ("read the committed test, don't re-run it"). So this throws loudly
 * rather than emit an untrustworthy test. Until it lands, exercise the runner
 * and fidelity gate with a hand-seeded example spec (see `examples/`).
 */

import type { CandidateTest, Compiler, Session } from "./types.js";

export class NotImplementedCompiler implements Compiler {
  compile(_session: Session): Promise<CandidateTest> {
    return Promise.reject(
      new Error(
        "session→test compilation is not implemented in v0.0.1 (Proofkeeper Initiative 2, the moat). " +
          "Use a hand-seeded Playwright spec to exercise the runner and fidelity gate for now.",
      ),
    );
  }
}
