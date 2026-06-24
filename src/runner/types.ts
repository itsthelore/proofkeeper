/**
 * The runner interface — Proofkeeper Initiative 4.
 *
 * A runner executes a compiled suite fast and in parallel across targets and
 * operating systems, emitting a replayable trace per result. The interface is
 * pluggable on purpose: the open-source local runner and the (out-of-scope for
 * v0.0.1) hosted VM-fabric runner are two implementations of the same shape.
 */

/** A compiled, durable end-to-end test the runner can execute. */
export interface CompiledTest {
  /** Stable identifier, used to correlate a result with a capability. */
  id: string;
  /** Path to the Playwright spec file (Proofkeeper-owned content). */
  specPath: string;
  /** Optional human title. */
  title?: string;
}

/** Where to run: a named environment with a base URL (e.g. dev, prod). */
export interface RunTarget {
  name: string;
  baseURL: string;
}

export interface RunOptions {
  targets: RunTarget[];
  /** Max concurrent test executions. Defaults are implementation-defined. */
  parallelism?: number;
}

export type RunStatus = "passed" | "failed" | "timedout" | "skipped";

/** The outcome of one test against one target, with its replayable trace. */
export interface RunResult {
  testId: string;
  target: string;
  status: RunStatus;
  durationMs: number;
  /** Path to the replayable trace artifact, when one was produced. */
  tracePath?: string;
}

/**
 * Runs compiled suites and returns one {@link RunResult} per (test, target).
 * Implementations own all runtime and content (browsers, runs, traces).
 */
export interface Runner {
  run(suite: CompiledTest[], options: RunOptions): Promise<RunResult[]>;
}
