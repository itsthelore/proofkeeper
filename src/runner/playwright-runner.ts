/**
 * A local Playwright runner skeleton — Proofkeeper Initiative 4.
 *
 * This is the open-source local runner. In v0.0.1 it establishes the shape and
 * exercises the fidelity gate against a hand-seeded example spec; it shells out
 * to the Playwright CLI (`npx playwright test`) so the runtime stays entirely
 * in this product, never in the Lore engine.
 *
 * The full cross-target / cross-OS matrix and trace-artifact wiring are
 * intentionally minimal here and grow in later versions.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CompiledTest, RunOptions, RunResult, Runner } from "./types.js";

const execFileAsync = promisify(execFile);

export interface PlaywrightRunnerOptions {
  /** Working directory the Playwright project lives in. Defaults to cwd. */
  cwd?: string;
  /** Override the Playwright invocation (advanced/testing). */
  command?: { bin: string; baseArgs: string[] };
}

export class PlaywrightRunner implements Runner {
  private readonly cwd: string;
  private readonly command: { bin: string; baseArgs: string[] };

  constructor(options: PlaywrightRunnerOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.command = options.command ?? { bin: "npx", baseArgs: ["playwright", "test"] };
  }

  async run(suite: CompiledTest[], options: RunOptions): Promise<RunResult[]> {
    const results: RunResult[] = [];
    for (const target of options.targets) {
      for (const test of suite) {
        results.push(await this.runOne(test, target.name, target.baseURL, options.parallelism));
      }
    }
    return results;
  }

  private async runOne(
    test: CompiledTest,
    targetName: string,
    baseURL: string,
    workers?: number,
  ): Promise<RunResult> {
    const args = [
      ...this.command.baseArgs,
      test.specPath,
      "--trace=on",
      ...(workers ? [`--workers=${workers}`] : []),
    ];
    const startedAt = process.hrtime.bigint();
    try {
      await execFileAsync(this.command.bin, args, {
        cwd: this.cwd,
        env: { ...process.env, PROOFKEEPER_BASE_URL: baseURL },
        maxBuffer: 64 * 1024 * 1024,
      });
      return {
        testId: test.id,
        target: targetName,
        status: "passed",
        durationMs: elapsedMs(startedAt),
        tracePath: "test-results", // Playwright writes traces under this dir
      };
    } catch {
      return {
        testId: test.id,
        target: targetName,
        status: "failed",
        durationMs: elapsedMs(startedAt),
        tracePath: "test-results",
      };
    }
  }
}

function elapsedMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1e6;
}
