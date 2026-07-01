/**
 * Parse Playwright's JSON reporter output into Proofkeeper {@link RunResult}s.
 *
 * Kept pure and separate from the runner so the report→result mapping is
 * unit-testable with a fixture, no browser required. The runner (which does
 * the actual `npx playwright test` shell-out) feeds raw report JSON in here.
 *
 * We model only the fields we read and tolerate the rest — Playwright's report
 * is large and versioned, and we never want a new field to break parsing.
 */

import type { RunResult, RunStatus } from "./types.js";

/** A single attempt's result inside the Playwright report. */
interface PwResult {
  status?: string;
  duration?: number;
  attachments?: { name?: string; path?: string; contentType?: string }[];
}

interface PwTest {
  results?: PwResult[];
}

interface PwSpec {
  title?: string;
  tests?: PwTest[];
}

interface PwSuite {
  specs?: PwSpec[];
  suites?: PwSuite[];
}

interface PwReport {
  suites?: PwSuite[];
}

/** Raised when reporter output is not parseable JSON. */
export class ReportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportParseError";
  }
}

function mapStatus(raw: string | undefined): RunStatus {
  switch (raw) {
    case "passed":
      return "passed";
    case "skipped":
      return "skipped";
    case "timedOut":
      return "timedout";
    default:
      // failed, interrupted, or anything unknown is a non-pass.
      return "failed";
  }
}

/** Depth-first walk of the nested suite tree, yielding every test. */
function collectTests(suites: PwSuite[] | undefined): PwTest[] {
  const out: PwTest[] = [];
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      out.push(...(spec.tests ?? []));
    }
    out.push(...collectTests(suite.suites));
  }
  return out;
}

function firstTracePath(results: PwResult[]): string | undefined {
  for (const result of results) {
    for (const attachment of result.attachments ?? []) {
      if (attachment.name === "trace" && attachment.path) return attachment.path;
    }
  }
  return undefined;
}

/**
 * Reduce a parsed report to a single {@link RunResult} for one (test, target).
 *
 * A spec file may contain several `test(...)` blocks; we aggregate them: the
 * run passed iff every test's FINAL attempt passed (a target project may
 * configure retries, and Playwright appends one result per attempt — the last
 * one is the test's outcome), the duration is the sum of final attempts, and
 * the trace is the first trace attachment found.
 *
 * @throws {ReportParseError} when the report contains no test results — a spec
 *   that ran nothing did not verify anything, and silently calling that
 *   "failed" would quarantine the capability with a misleading reason. The
 *   usual cause is a spec path outside the Playwright config's `testDir`.
 */
export function reduceReport(report: PwReport, testId: string, target: string): RunResult {
  const tests = collectTests(report.suites);
  // One result per test: its final attempt (retries append earlier attempts).
  const finals = tests
    .map((t) => t.results?.[t.results.length - 1])
    .filter((r): r is PwResult => r !== undefined);

  if (finals.length === 0) {
    throw new ReportParseError(
      `the Playwright report for '${testId}' contains no test results — no tests matched. ` +
        "Check that the spec path is inside the target Playwright config's testDir/testMatch.",
    );
  }

  const statuses = finals.map((r) => mapStatus(r.status));
  const durationMs = finals.reduce((sum, r) => sum + (r.duration ?? 0), 0);
  const allPassed = statuses.every((s) => s === "passed");

  // Surface the most informative non-pass status when not all passed.
  const status: RunStatus = allPassed
    ? "passed"
    : (statuses.find((s) => s === "timedout") ?? statuses.find((s) => s === "failed") ?? "failed");

  const result: RunResult = { testId, target, status, durationMs };
  // Prefer a trace from a final attempt; fall back to any attempt's trace.
  const tracePath =
    firstTracePath(finals) ?? firstTracePath(tests.flatMap((t) => t.results ?? []));
  if (tracePath) result.tracePath = tracePath;
  return result;
}

/** Parse reporter stdout (JSON) and reduce it to a {@link RunResult}. */
export function parseReport(stdout: string, testId: string, target: string): RunResult {
  let report: PwReport;
  try {
    report = JSON.parse(stdout) as PwReport;
  } catch (err) {
    throw new ReportParseError(
      `could not parse Playwright JSON report: ${(err as Error).message}`,
    );
  }
  return reduceReport(report, testId, target);
}
