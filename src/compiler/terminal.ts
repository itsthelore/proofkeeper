/**
 * The terminal half of the drive — running shell commands and asserting their
 * output, the second of the "browser and a terminal" tools ADR-083 sanctions.
 *
 * {@link runCommand} and {@link evalOutputMatch} are the single source of truth
 * for how a command is executed and how its output is matched. The {@link
 * Recorder} uses them while driving, and the emitted spec inlines an equivalent
 * `runCommand` + the same `expect` shapes — so record and replay agree exactly,
 * which is what lets the fidelity gate mean something for terminal sessions.
 */

import { spawnSync } from "node:child_process";

/** The observable result of running one command. */
export interface CommandResult {
  stdout: string;
  stderr: string;
  /** Process exit code (0 when the process did not set one). */
  code: number;
}

/** How a {@link CommandResult} stream is matched against an expected value. */
export interface OutputAssertion {
  match: "exact" | "contains" | "regex";
  stream: "stdout" | "stderr";
  value: string;
}

/**
 * Wall-clock cap on one command. A hung command (a server that never exits, a
 * prompt waiting for input) must not hang the whole drive; the timeout error
 * surfaces to the model as a failed action. Mirrored in the emitted spec.
 */
export const COMMAND_TIMEOUT_MS = 120_000;

/** Output cap per stream — beyond this the command errors instead of ENOBUFS. */
export const COMMAND_MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Run a shell command and capture its result. Uses `shell: true` so a recorded
 * command string (pipes, args, redirects) runs as written. The command executes
 * in the caller's own environment — a developer's terminal — exactly as the
 * committed test will when re-run (the trust boundary stays human PR review,
 * ADR-065).
 *
 * @throws when the process could not be spawned, timed out, or overflowed the
 *   output cap (a runner error, not a verdict).
 */
export function runCommand(
  command: string,
  options: { cwd?: string; timeoutMs?: number } = {},
): CommandResult {
  const result = spawnSync(command, {
    shell: true,
    encoding: "utf8",
    timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
    maxBuffer: COMMAND_MAX_BUFFER,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  });
  if (result.error) throw result.error;
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status ?? 0 };
}

/**
 * Evaluate an output assertion against a result. This mirrors, byte for byte,
 * the assertions {@link emitSpec} renders, so a recording that held here re-runs
 * green in the compiled test.
 */
export function evalOutputMatch(result: CommandResult, assertion: OutputAssertion): boolean {
  const actual = result[assertion.stream];
  switch (assertion.match) {
    case "exact":
      return actual.trim() === assertion.value;
    case "contains":
      return actual.includes(assertion.value);
    case "regex":
      return new RegExp(assertion.value).test(actual);
  }
}
