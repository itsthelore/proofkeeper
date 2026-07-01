import { describe, expect, it } from "vitest";

import { parseReport, reduceReport, ReportParseError } from "../src/runner/playwright-report.js";

/** A minimal Playwright JSON report with one passing test and a trace. */
const passingReport = {
  suites: [
    {
      specs: [
        {
          title: "seed: drives a browser",
          tests: [
            {
              results: [
                {
                  status: "passed",
                  duration: 412,
                  attachments: [
                    { name: "trace", path: "/work/test-results/seed/trace.zip", contentType: "application/zip" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("reduceReport", () => {
  it("maps a passing report to a passed result with the real trace path", () => {
    const result = reduceReport(passingReport, "seed", "dev");
    expect(result.status).toBe("passed");
    expect(result.durationMs).toBe(412);
    expect(result.tracePath).toBe("/work/test-results/seed/trace.zip");
    expect(result.testId).toBe("seed");
    expect(result.target).toBe("dev");
  });

  it("maps a failed result", () => {
    const report = { suites: [{ specs: [{ tests: [{ results: [{ status: "failed", duration: 10 }] }] }] }] };
    expect(reduceReport(report, "t", "dev").status).toBe("failed");
  });

  it("maps a timed-out result to 'timedout'", () => {
    const report = { suites: [{ specs: [{ tests: [{ results: [{ status: "timedOut", duration: 30000 }] }] }] }] };
    expect(reduceReport(report, "t", "dev").status).toBe("timedout");
  });

  it("recurses into nested suites", () => {
    const nested = { suites: [{ suites: [{ specs: [{ tests: [{ results: [{ status: "passed", duration: 5 }] }] }] }] }] };
    expect(reduceReport(nested, "t", "dev").status).toBe("passed");
  });

  it("refuses a report with no results — no tests matched is not 'failed'", () => {
    expect(() => reduceReport({ suites: [] }, "t", "dev")).toThrow(/no tests matched/);
    expect(() => reduceReport({}, "t", "dev")).toThrow(/testDir/);
  });

  it("uses each test's final attempt when the target project configures retries", () => {
    const flakyThenGreen = {
      suites: [
        {
          specs: [
            {
              tests: [
                // Playwright appends one result per attempt; the last is the outcome.
                { results: [{ status: "failed", duration: 5 }, { status: "passed", duration: 7 }] },
              ],
            },
          ],
        },
      ],
    };
    const result = reduceReport(flakyThenGreen, "t", "dev");
    expect(result.status).toBe("passed");
    expect(result.durationMs).toBe(7);

    const retriedAndStillFailing = {
      suites: [
        { specs: [{ tests: [{ results: [{ status: "failed" }, { status: "failed" }] }] }] },
      ],
    };
    expect(reduceReport(retriedAndStillFailing, "t", "dev").status).toBe("failed");
  });

  it("passes only when every result in the spec passed", () => {
    const mixed = {
      suites: [
        {
          specs: [
            { tests: [{ results: [{ status: "passed", duration: 1 }] }] },
            { tests: [{ results: [{ status: "failed", duration: 1 }] }] },
          ],
        },
      ],
    };
    expect(reduceReport(mixed, "t", "dev").status).toBe("failed");
  });
});

describe("parseReport", () => {
  it("parses reporter stdout JSON", () => {
    const result = parseReport(JSON.stringify(passingReport), "seed", "dev");
    expect(result.status).toBe("passed");
  });

  it("throws on non-JSON reporter output", () => {
    expect(() => parseReport("Error: browsers not installed", "seed", "dev")).toThrow(ReportParseError);
  });
});
