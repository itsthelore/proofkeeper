import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";

import { AutonomousDriver } from "../src/agent/drive.js";
import { ClaudeModelClient, type AnthropicLike } from "../src/agent/adapters/claude.js";
import { CodegenCompiler } from "../src/compiler/compiler.js";
import { PlaywrightRunner } from "../src/runner/playwright-runner.js";
import { assessFidelity } from "../src/fidelity/gate.js";

/**
 * Proves the REAL ClaudeModelClient drives the loop end-to-end: only the SDK
 * transport is faked (returning Anthropic-shaped tool_use blocks), so the
 * adapter's actual transcript→messages and response→ModelResponse translation
 * runs inside the live AutonomousDriver against a real browser. A live API call
 * additionally needs ANTHROPIC_API_KEY and is not exercised in CI.
 */
const e2e = process.env.PROOFKEEPER_E2E ? describe : describe.skip;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const productHtml = fileURLToPath(new URL("../examples/product/index.html", import.meta.url));

/** Fake Anthropic transport: decides from the latest observation, emits tool_use blocks. */
function fakeAnthropic(): AnthropicLike {
  return {
    messages: {
      create(params) {
        const lastUser = [...params.messages].reverse().find((m) => m.role === "user")?.content ?? "";
        const verified = lastUser.includes("verified") && !lastUser.includes("unverified");
        if (verified) {
          return Promise.resolve({
            stop_reason: "tool_use",
            content: [
              { type: "text", text: "Status flipped — asserting and finishing." },
              { type: "tool_use", name: "expect_text", input: { locator: { strategy: "testId", testId: "status" }, text: "verified" } },
              { type: "tool_use", name: "finish", input: {} },
            ],
          });
        }
        return Promise.resolve({
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", name: "expect_text", input: { locator: { strategy: "testId", testId: "heading" }, text: "Lore Proofkeeper" } },
            { type: "tool_use", name: "expect_text", input: { locator: { strategy: "testId", testId: "status" }, text: "unverified" } },
            { type: "tool_use", name: "click", input: { locator: { strategy: "role", role: "button", name: "Verify" } } },
          ],
        });
      },
    },
  };
}

e2e("ClaudeModelClient drives the loop (faked transport)", () => {
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
    "the adapter's real translation runs in the loop and the compiled test is stable",
    async () => {
      const page = await browser.newPage();
      const model = new ClaudeModelClient({ client: fakeAnthropic() });
      const driver = new AutonomousDriver(page, model, {
        capabilityId: "REQ-VERIFY",
        title: "verify interaction flips status to verified",
        startUrl: baseURL,
        goal: "Click Verify and confirm the status changes to 'verified'.",
      });

      const { session, finished } = await driver.drive();
      await page.close();

      expect(finished).toBe(true);
      expect(session.actions.map((a) => a.type)).toEqual([
        "goto",
        "expectText",
        "expectText",
        "click",
        "expectText",
      ]);

      const candidate = await new CodegenCompiler({ outDir: "examples/generated/claude" }).compile(session);
      expect(existsSync(`${projectRoot}/${candidate.specPath}`)).toBe(true);

      const runner = new PlaywrightRunner({ cwd: projectRoot, outputDir: "test-results/claude" });
      const verdict = await assessFidelity(runner, candidate, { n: 3, target: { name: "local", baseURL } });
      expect(verdict.stable).toBe(true);
    },
    300_000,
  );
});
