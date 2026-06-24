/**
 * The fidelity gate — Proofkeeper Initiative 3 (the moat's acceptance bar).
 *
 * A compiled test earns trust only by surviving N re-runs green and stable.
 * This gate has real logic: it re-runs a candidate through a {@link Runner} N
 * times against a single target and accepts it iff every run passed. Anything
 * less is quarantined, not committed. That stability is what lets a reviewer
 * trust a committed test without running it locally.
 */

import type { CompiledTest, Runner, RunTarget } from "../runner/types.js";

export interface FidelityOptions {
  /** How many times to re-run the candidate. */
  n: number;
  /** The single target to assess stability against. */
  target: RunTarget;
  /** Parallelism passed through to the runner per attempt. */
  parallelism?: number;
}

export interface FidelityVerdict {
  testId: string;
  /** Accepted iff all `attempts` runs passed. */
  stable: boolean;
  attempts: number;
  passed: number;
  /** Per-attempt pass/fail, in order. */
  runs: boolean[];
}

/**
 * Assess a candidate test's fidelity by re-running it `n` times.
 *
 * @throws {RangeError} when `n < 1`.
 */
export async function assessFidelity(
  runner: Runner,
  test: CompiledTest,
  options: FidelityOptions,
): Promise<FidelityVerdict> {
  if (options.n < 1) {
    throw new RangeError(`fidelity requires at least one run, got n=${options.n}`);
  }

  const runs: boolean[] = [];
  for (let attempt = 0; attempt < options.n; attempt++) {
    const results = await runner.run([test], {
      targets: [options.target],
      parallelism: options.parallelism,
    });
    // One test, one target ⇒ a single result. Treat a missing result as failure.
    const passed = results.length > 0 && results.every((r) => r.status === "passed");
    runs.push(passed);
  }

  const passed = runs.filter(Boolean).length;
  return {
    testId: test.id,
    stable: passed === options.n,
    attempts: options.n,
    passed,
    runs,
  };
}
