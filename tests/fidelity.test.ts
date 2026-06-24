import { describe, expect, it } from "vitest";

import { assessFidelity } from "../src/fidelity/gate.js";
import type { CompiledTest, Runner, RunOptions, RunResult } from "../src/runner/types.js";

const TEST: CompiledTest = { id: "seed", specPath: "examples/seed.spec.ts" };
const TARGET = { name: "dev", baseURL: "http://localhost" };

/** A runner whose results follow a fixed script of pass/fail per call. */
class ScriptedRunner implements Runner {
  private call = 0;
  constructor(private readonly script: boolean[]) {}
  run(suite: CompiledTest[], _options: RunOptions): Promise<RunResult[]> {
    const pass = this.script[this.call++] ?? false;
    return Promise.resolve(
      suite.map((t) => ({
        testId: t.id,
        target: TARGET.name,
        status: pass ? "passed" : "failed",
        durationMs: 1,
      })),
    );
  }
}

describe("assessFidelity", () => {
  it("accepts a test that re-runs green N times", async () => {
    const verdict = await assessFidelity(new ScriptedRunner([true, true, true]), TEST, {
      n: 3,
      target: TARGET,
    });
    expect(verdict.stable).toBe(true);
    expect(verdict.passed).toBe(3);
    expect(verdict.runs).toEqual([true, true, true]);
  });

  it("rejects a flaky test (one failure among N)", async () => {
    const verdict = await assessFidelity(new ScriptedRunner([true, false, true]), TEST, {
      n: 3,
      target: TARGET,
    });
    expect(verdict.stable).toBe(false);
    expect(verdict.passed).toBe(2);
  });

  it("re-runs exactly N times", async () => {
    let calls = 0;
    const counting: Runner = {
      run: (suite) => {
        calls++;
        return Promise.resolve(
          suite.map((t) => ({ testId: t.id, target: TARGET.name, status: "passed" as const, durationMs: 1 })),
        );
      },
    };
    await assessFidelity(counting, TEST, { n: 5, target: TARGET });
    expect(calls).toBe(5);
  });

  it("treats a missing result as a failed attempt", async () => {
    const empty: Runner = { run: () => Promise.resolve([]) };
    const verdict = await assessFidelity(empty, TEST, { n: 2, target: TARGET });
    expect(verdict.stable).toBe(false);
    expect(verdict.passed).toBe(0);
  });

  it("requires at least one run", async () => {
    await expect(assessFidelity(new ScriptedRunner([]), TEST, { n: 0, target: TARGET })).rejects.toThrow(
      RangeError,
    );
  });
});
