import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";

import { AutonomousDriver } from "../src/agent/drive.js";
import type { ModelClient, ModelRequest, ModelResponse } from "../src/agent/model.js";
import { CodegenCompiler } from "../src/compiler/compiler.js";
import { PlaywrightRunner } from "../src/runner/playwright-runner.js";
import { assessFidelity } from "../src/fidelity/gate.js";

/**
 * Browser AND terminal: a BYO model drives a CLI capability — it runs a shell
 * command and asserts its output and exit code — and the autonomously-recorded
 * session compiles into a test that passes the fidelity gate. No HTTP server:
 * the drive seeds about:blank, then works in the terminal. Gated behind
 * PROOFKEEPER_E2E.
 */
const e2e = process.env.PROOFKEEPER_E2E ? describe : describe.skip;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

/** Decides from the observation: run the command, then assert its result and finish. */
class TerminalFlowModel implements ModelClient {
  complete(request: ModelRequest): Promise<ModelResponse> {
    const lastObservation = [...request.transcript].reverse().find((m) => m.role === "user")?.content ?? "";
    const ran = lastObservation.includes("order-7");

    if (ran) {
      return Promise.resolve({
        toolCalls: [
          { name: "expect_output", arguments: { match: "contains", stream: "stdout", value: "order-7" } },
          { name: "expect_exit", arguments: { code: 0 } },
          { name: "finish", arguments: {} },
        ],
      });
    }
    return Promise.resolve({
      toolCalls: [{ name: "run_command", arguments: { command: "node -e \"console.log('order-7')\"" } }],
    });
  }
}

e2e("AutonomousDriver — a BYO model drives a CLI capability via the terminal", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  it(
    "runs a command, asserts its output, and the emitted test passes fidelity",
    async () => {
      const page = await browser.newPage();
      const driver = new AutonomousDriver(page, new TerminalFlowModel(), {
        capabilityId: "REQ-CLI",
        title: "cli prints the order number",
        startUrl: "about:blank",
        goal: "Run the CLI and confirm it prints the order number with exit 0.",
        allowShell: true, // a terminal capability is an explicit operator opt-in
      });

      const { session, finished } = await driver.drive();
      await page.close();

      // The model ran the command, then asserted output + exit, then finished.
      expect(finished).toBe(true);
      expect(session.actions.map((a) => a.type)).toEqual(["goto", "run", "expectOutput", "expectExit"]);

      const compiler = new CodegenCompiler({ outDir: "examples/generated/terminal" });
      const candidate = await compiler.compile(session);
      expect(existsSync(`${projectRoot}/${candidate.specPath}`)).toBe(true);

      const runner = new PlaywrightRunner({ cwd: projectRoot, outputDir: "test-results/terminal" });
      const verdict = await assessFidelity(runner, candidate, {
        n: 3,
        target: { name: "local", baseURL: "about:blank" },
      });

      expect(verdict.stable).toBe(true);
      expect(verdict.passed).toBe(3);
    },
    300_000,
  );
});
