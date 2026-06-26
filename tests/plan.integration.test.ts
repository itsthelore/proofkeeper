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
 * The plan stage: with planning enabled, the model first writes a Markdown test
 * plan (a no-tools text turn), the plan is recorded on the session, and the drive
 * then proceeds to a session that still compiles green. Gated behind PROOFKEEPER_E2E.
 */
const e2e = process.env.PROOFKEEPER_E2E ? describe : describe.skip;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const productHtml = fileURLToPath(new URL("../examples/product/index.html", import.meta.url));

/** Plan-aware double: writes a plan when offered no tools, then drives the verify flow. */
class PlanningModel implements ModelClient {
  complete(request: ModelRequest): Promise<ModelResponse> {
    // The planning turn offers no tools — respond with a Markdown plan as text.
    if (request.tools.length === 0) {
      return Promise.resolve({
        done: "1. Open the page\n2. Click Verify\n3. Assert the status reads 'verified'",
      });
    }
    const lastObservation = [...request.transcript].reverse().find((m) => m.role === "user")?.content ?? "";
    const statusVerified = lastObservation.includes("verified") && !lastObservation.includes("unverified");
    if (statusVerified) {
      return Promise.resolve({
        toolCalls: [
          { name: "expect_text", arguments: { locator: { strategy: "testId", testId: "status" }, text: "verified" } },
          { name: "finish", arguments: {} },
        ],
      });
    }
    return Promise.resolve({
      toolCalls: [{ name: "click", arguments: { locator: { strategy: "role", role: "button", name: "Verify" } } }],
    });
  }
}

e2e("AutonomousDriver — planning turn records a plan and still compiles green", () => {
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
    "emits a plan before driving, records it on the session, and passes fidelity",
    async () => {
      const page = await browser.newPage();
      const result = await new AutonomousDriver(page, new PlanningModel(), {
        capabilityId: "REQ-VERIFY",
        title: "verify interaction flips status to verified",
        startUrl: baseURL,
        goal: "Click Verify and confirm the status changes to 'verified'.",
        plan: true,
      }).drive();
      await page.close();

      expect(result.finished).toBe(true);
      // The plan was captured on both the result and the session metadata.
      expect(result.plan).toContain("Click Verify");
      expect(result.session.plan).toBe(result.plan);
      // The plan is metadata only — the recorded actions are the real interactions.
      expect(result.session.actions.some((a) => a.type === "click")).toBe(true);

      const candidate = await new CodegenCompiler({ outDir: "examples/generated/plan" }).compile(result.session);
      expect(existsSync(`${projectRoot}/${candidate.specPath}`)).toBe(true);
      // The plan is NOT compiled into the spec.
      expect(await readFile(`${projectRoot}/${candidate.specPath}`, "utf8")).not.toContain("Click Verify\n2.");

      const verdict = await assessFidelity(new PlaywrightRunner({ cwd: projectRoot, outputDir: "test-results/plan" }), candidate, {
        n: 3,
        target: { name: "local", baseURL },
      });
      expect(verdict.stable).toBe(true);
    },
    300_000,
  );
});
