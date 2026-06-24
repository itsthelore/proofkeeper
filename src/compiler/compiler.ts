/**
 * Compilers for the session→test moat (Proofkeeper Initiative 2).
 *
 * - {@link CodegenCompiler} is the real compiler: it reduces a recorded action
 *   trace to deterministic Playwright source ({@link emitSpec}) and writes it to
 *   a `.spec.ts` file, returning a candidate test for the fidelity gate.
 * - {@link NotImplementedCompiler} remains for the not-yet-autonomous drive
 *   path: when no real session was recorded, it refuses rather than emit a fake.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { RecordedSession } from "./actions.js";
import { emitSpec } from "./emit.js";
import type { CandidateTest, Compiler } from "./types.js";

export interface CodegenCompilerOptions {
  /** Directory the emitted `.spec.ts` files are written to. */
  outDir: string;
}

/** A filesystem-safe slug for a spec filename, derived deterministically. */
function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "session";
}

export class CodegenCompiler implements Compiler {
  constructor(private readonly options: CodegenCompilerOptions) {}

  async compile(session: RecordedSession): Promise<CandidateTest> {
    const source = emitSpec(session); // throws if the session recorded nothing
    const id = session.capabilityId ? slug(session.capabilityId) : slug(session.title);
    const specPath = join(this.options.outDir, `${id}.spec.ts`);

    await mkdir(dirname(specPath), { recursive: true });
    await writeFile(specPath, source, "utf8");

    return { id, specPath, title: session.title, fromSession: session };
  }
}

/** Refuses to emit when there is no recorded session (the deferred drive path). */
export class NotImplementedCompiler implements Compiler {
  compile(_session: RecordedSession): Promise<CandidateTest> {
    return Promise.reject(
      new Error(
        "autonomous drive→compile is not implemented in v0.0.1. Record a session " +
          "with the Recorder and compile it with CodegenCompiler instead.",
      ),
    );
  }
}
