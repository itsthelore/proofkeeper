import { createServer, type Server } from "node:http";
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
 * Browser AND HTTP: a BYO model drives an API capability — it issues a request and
 * asserts the response status and a JSON field — and the autonomously-recorded
 * session compiles into a test that passes the fidelity gate. The HTTP modality is
 * gated on ADR-085. Gated behind PROOFKEEPER_E2E.
 */
const e2e = process.env.PROOFKEEPER_E2E ? describe : describe.skip;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

/** Decides from the observation: request the API, then assert status + JSON and finish. */
class ApiFlowModel implements ModelClient {
  constructor(private readonly baseURL: string) {}
  complete(request: ModelRequest): Promise<ModelResponse> {
    const last = [...request.transcript].reverse().find((m) => m.role === "user")?.content ?? "";
    if (last.includes('"id":7')) {
      return Promise.resolve({
        toolCalls: [
          { name: "expect_status", arguments: { status: 200 } },
          { name: "expect_json", arguments: { path: "data.id", equals: 7 } },
          { name: "finish", arguments: {} },
        ],
      });
    }
    return Promise.resolve({
      toolCalls: [{ name: "request", arguments: { method: "GET", url: `${this.baseURL}/order` } }],
    });
  }
}

e2e("AutonomousDriver — a BYO model verifies an API capability over HTTP", () => {
  let server: Server;
  let baseURL: string;
  let browser: Browser;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/order") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: { id: 7, status: "paid" } }));
      } else {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<title>api</title>");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (typeof addr === "string" || addr === null) throw new Error("no server address");
    baseURL = `http://127.0.0.1:${addr.port}`;
    browser = await chromium.launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it(
    "requests the endpoint, asserts status and JSON, and the emitted test passes fidelity",
    async () => {
      const page = await browser.newPage();
      const { session, finished } = await new AutonomousDriver(page, new ApiFlowModel(baseURL), {
        capabilityId: "REQ-API",
        title: "order endpoint returns the order id",
        startUrl: `${baseURL}/`,
        goal: "Request the order endpoint and confirm it returns 200 with order id 7.",
      }).drive();
      await page.close();

      expect(finished).toBe(true);
      expect(session.actions.map((a) => a.type)).toEqual(["goto", "request", "expectStatus", "expectJson"]);

      const candidate = await new CodegenCompiler({ outDir: "examples/generated/http" }).compile(session);
      expect(existsSync(`${projectRoot}/${candidate.specPath}`)).toBe(true);

      const verdict = await assessFidelity(new PlaywrightRunner({ cwd: projectRoot, outputDir: "test-results/http" }), candidate, {
        n: 3,
        target: { name: "local", baseURL: `${baseURL}/` },
      });
      expect(verdict.stable).toBe(true);
      expect(verdict.passed).toBe(3);
    },
    300_000,
  );
});
