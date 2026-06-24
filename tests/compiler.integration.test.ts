import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";

import { Recorder } from "../src/compiler/recorder.js";
import { CodegenCompiler } from "../src/compiler/compiler.js";
import { PlaywrightRunner } from "../src/runner/playwright-runner.js";
import { assessFidelity } from "../src/fidelity/gate.js";

/**
 * The moat milestone: ONE faithful session→test, end to end.
 *
 * Serve a real product over HTTP, record a real browser drive, compile the
 * recorded trace into a `.spec.ts`, then prove the emitted test passes the
 * fidelity gate over 3 green re-runs against the real server. Gated behind
 * PROOFKEEPER_E2E (needs a browser); run in the CI e2e job.
 */
const e2e = process.env.PROOFKEEPER_E2E ? describe : describe.skip;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const productHtml = fileURLToPath(new URL("../examples/product/index.html", import.meta.url));

e2e("CodegenCompiler — one faithful session→test", () => {
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
    "records a drive, compiles it, and the emitted test passes the fidelity gate",
    async () => {
      // DRIVE + RECORD — perform real actions; each is recorded only if it held.
      const page = await browser.newPage();
      const recorder = new Recorder(page, {
        capabilityId: "REQ-VERIFY",
        title: "verify interaction flips status to verified",
        startUrl: baseURL,
      });
      await recorder.goto();
      await recorder.expectText({ kind: "testId", testId: "heading" }, "Lore Proofkeeper");
      await recorder.expectText({ kind: "testId", testId: "status" }, "unverified");
      await recorder.click({ kind: "role", role: "button", name: "Verify" });
      await recorder.expectText({ kind: "testId", testId: "status" }, "verified");
      await page.close();

      const session = recorder.recording();
      expect(session.actions).toHaveLength(5);

      // COMPILE — reduce the recorded trace to a committed .spec.ts.
      const compiler = new CodegenCompiler({ outDir: "examples/generated/compiler" });
      const candidate = await compiler.compile(session);
      expect(existsSync(`${projectRoot}/${candidate.specPath}`)).toBe(true);

      // FIDELITY — the emitted test must re-run green and stable 3 times.
      const runner = new PlaywrightRunner({ cwd: projectRoot, outputDir: "test-results/compiler" });
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
