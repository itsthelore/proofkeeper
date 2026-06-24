import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
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
 * The autonomous-drive milestone: a BYO model DECIDES the actions, the driver
 * executes and records them, and the autonomously-recorded session compiles
 * into a test that passes the fidelity gate. Gated behind PROOFKEEPER_E2E.
 *
 * The model here is a scripted test double standing in for a real LLM: it reads
 * the latest page observation and chooses tool calls from it — proving the
 * perceive→decide→act loop, not a pre-scripted sequence the test plays back.
 */
const e2e = process.env.PROOFKEEPER_E2E ? describe : describe.skip;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const productHtml = fileURLToPath(new URL("../examples/product/index.html", import.meta.url));

/** A model that decides from observations: assert + click, then assert + finish. */
class VerifyFlowModel implements ModelClient {
  complete(request: ModelRequest): Promise<ModelResponse> {
    const lastObservation = [...request.transcript].reverse().find((m) => m.role === "user")?.content ?? "";
    const statusVerified =
      lastObservation.includes("verified") && !lastObservation.includes("unverified");

    if (statusVerified) {
      // The interaction took effect — assert the outcome and finish.
      return Promise.resolve({
        toolCalls: [
          { name: "expect_text", arguments: { locator: { strategy: "testId", testId: "status" }, text: "verified" } },
          { name: "finish", arguments: {} },
        ],
      });
    }

    // Baseline: assert the starting state, then drive the verify interaction.
    return Promise.resolve({
      toolCalls: [
        { name: "expect_text", arguments: { locator: { strategy: "testId", testId: "heading" }, text: "Lore Proofkeeper" } },
        { name: "expect_text", arguments: { locator: { strategy: "testId", testId: "status" }, text: "unverified" } },
        { name: "click", arguments: { locator: { strategy: "role", role: "button", name: "Verify" } } },
      ],
    });
  }
}

e2e("AutonomousDriver — a BYO model drives and the session compiles green", () => {
  let server: Server;
  let baseURL: string;
  let browser: Browser;

  beforeAll(async () => {
    const html = await readFile(productHtml, "utf8");
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (typeof addr === "string" || addr === null) throw new Error("no server address");
    baseURL = `http://127.0.0.1:${addr.port}/`;
    browser = await chromium.launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it(
    "drives autonomously, records a faithful session, and the emitted test passes fidelity",
    async () => {
      const page = await browser.newPage();
      const driver = new AutonomousDriver(page, new VerifyFlowModel(), {
        capabilityId: "REQ-VERIFY",
        title: "verify interaction flips status to verified",
        startUrl: baseURL,
        goal: "Click Verify and confirm the status changes to 'verified'.",
      });

      const { session, finished, steps } = await driver.drive();
      await page.close();

      // The model finished on its own, in a couple of turns, and the recorder
      // captured the goto + the four asserted/clicked actions it succeeded at.
      expect(finished).toBe(true);
      expect(steps).toBeLessThanOrEqual(3);
      expect(session.actions.map((a) => a.type)).toEqual([
        "goto",
        "expectText",
        "expectText",
        "click",
        "expectText",
      ]);

      // COMPILE the autonomously-recorded session and FIDELITY-gate it.
      const compiler = new CodegenCompiler({ outDir: "examples/generated/drive" });
      const candidate = await compiler.compile(session);
      expect(existsSync(`${projectRoot}/${candidate.specPath}`)).toBe(true);

      const runner = new PlaywrightRunner({ cwd: projectRoot, outputDir: "test-results/drive" });
      const verdict = await assessFidelity(runner, candidate, {
        n: 3,
        target: { name: "local", baseURL },
      });

      expect(verdict.stable).toBe(true);
      expect(verdict.passed).toBe(3);
    },
    300_000,
  );
});
