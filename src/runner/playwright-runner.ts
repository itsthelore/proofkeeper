/**
 * The local Playwright runner — Proofkeeper Initiative 4.
 *
 * The open-source local runner. It shells out to the Playwright CLI
 * (`npx playwright test`) so the test runtime stays entirely in this product,
 * never in the Lore engine, and parses Playwright's JSON reporter into typed
 * {@link RunResult}s — real status, duration, and the actual trace path, not
 * values inferred from an exit code.
 *
 * The full cross-target / cross-OS matrix is still minimal here (targets run
 * sequentially) and grows in later versions; the hosted VM-fabric runner is a
 * separate implementation of the same {@link Runner} interface.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseReport } from "./playwright-report.js";
import type { CompiledTest, RunOptions, RunResult, Runner } from "./types.js";

const execFileAsync = promisify(execFile);

/** Shape of the error execFile rejects with — carries captured stdio. */
interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

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
      "--reporter=json",
      "--trace=on",
      ...(workers ? [`--workers=${workers}`] : []),
    ];
    const env = { ...process.env, PROOFKEEPER_BASE_URL: baseURL };

    // Playwright exits non-zero when tests fail, but still writes the JSON
    // report to stdout. Capture stdout in both cases and let the report — not
    // the exit code — decide the verdict.
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(this.command.bin, args, {
        cwd: this.cwd,
        env,
        maxBuffer: 256 * 1024 * 1024,
      }));
    } catch (err) {
      const execErr = err as ExecError;
      if (typeof execErr.stdout === "string" && execErr.stdout.trim().startsWith("{")) {
        stdout = execErr.stdout;
      } else {
        // The CLI failed before producing a report (e.g. Playwright not
        // installed, browsers missing). That is a runner error, not a test
        // verdict — surface it.
        throw new Error(
          `playwright run failed for '${test.specPath}': ${execErr.message}` +
            (execErr.stderr ? `\n${execErr.stderr}` : ""),
        );
      }
    }

    return parseReport(stdout, test.id, targetName);
  }
}
