import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";

import { runQa, type QaDeps } from "../src/qa/run-qa.js";
import { AutonomousDriver } from "../src/agent/drive.js";
import type { ModelClient, ModelRequest, ModelResponse } from "../src/agent/model.js";
import { CodegenCompiler } from "../src/compiler/compiler.js";
import { PlaywrightRunner } from "../src/runner/playwright-runner.js";
import type { Graph } from "../src/coverage/graph.js";
import type { WriteBackInput, WriteBackProposer, WriteBackResult } from "../src/writeback/proposer.js";

/**
 * The QA loop behind one entry point, end to end: `runQa` selects the
 * unverified capability, drives it with a real browser + a BYO model, compiles
 * and fidelity-gates the session, and proposes the write-back. This is exactly
 * what the `proofkeeper qa` command runs (minus the env-wired browser/model).
 * Gated behind PROOFKEEPER_E2E.
 */
const e2e = process.env.PROOFKEEPER_E2E ? describe : describe.skip;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const productHtml = fileURLToPath(new URL("../examples/product/index.html", import.meta.url));

/** A model that decides from observations: assert + click, then assert + finish. */
class VerifyFlowModel implements ModelClient {
  complete(request: ModelRequest): Promise<ModelResponse> {
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
      toolCalls: [
        { name: "expect_text", arguments: { locator: { strategy: "testId", testId: "heading" }, text: "Lore Proofkeeper" } },
        { name: "expect_text", arguments: { locator: { strategy: "testId", testId: "status" }, text: "unverified" } },
        { name: "click", arguments: { locator: { strategy: "role", role: "button", name: "Verify" } } },
      ],
    });
  }
}

class CapturingProposer implements WriteBackProposer {
  input?: WriteBackInput;
  propose(input: WriteBackInput): Promise<WriteBackResult> {
    this.input = input;
    return Promise.resolve({
      status: "proposed",
      url: "https://github.com/itsthelore/demo/pull/1",
      number: 1,
      headBranch: "proofkeeper/verified-by/req-verify",
    });
  }
}

e2e("runQa — the QA loop drives, gates, and proposes end to end", () => {
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
    "selects the unverified capability, drives it, gates fidelity, and proposes the write-back",
    async () => {
      const graph: Graph = {
        schema_version: "1",
        source: "demo",
        nodes: [{ id: "REQ-VERIFY", type: "requirement", status: "Accepted", title: "Verify interaction" }],
        edges: [],
      };

      const proposer = new CapturingProposer();
      const deps: QaDeps = {
        drive: async (options) => {
          const page = await browser.newPage();
          try {
            return await new AutonomousDriver(page, new VerifyFlowModel(), options).drive();
          } finally {
            await page.close();
          }
        },
        compiler: new CodegenCompiler({ outDir: "examples/generated/qa" }),
        runner: new PlaywrightRunner({ cwd: projectRoot, outputDir: "test-results/qa" }),
        proposer,
      };

      const result = await runQa(deps, {
        graph,
        startUrl: baseURL,
        target: { name: "local", baseURL },
        n: 3,
        propose: { targetPath: "rac/requirements/verify.md" },
      });

      expect(result.capability.id).toBe("REQ-VERIFY");
      expect(result.drive.finished).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.loop.verdict.passed).toBe(3);

      // The write-back was proposed with the committed spec + its replayable trace.
      expect(result.writeBack?.status).toBe("proposed");
      expect(proposer.input?.capabilityId).toBe("REQ-VERIFY");
      expect(proposer.input?.links[0]?.test).toContain("examples/generated/qa");
      expect(proposer.input?.links[0]?.trace).toBeDefined();
      expect(proposer.input?.fidelity).toEqual({ attempts: 3, passed: 3, stable: true });
    },
    300_000,
  );
});
