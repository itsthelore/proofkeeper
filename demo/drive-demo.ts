/**
 * Records a Proofkeeper drive as a video — the same harness for both the
 * deterministic demo and a real run.
 *
 *   node --import tsx demo/drive-demo.ts
 *
 * The drive → compile loop is real (real Chromium, real driver, real emitter).
 * The MODEL is chosen from the environment:
 *
 *   - no key set          → a SCRIPTED model decides the actions (deterministic,
 *                           token-free). This is the demo the committed GIF uses.
 *   - OPENAI_API_KEY set   → the OpenAI-compatible adapter (a real LLM drive).
 *   - ANTHROPIC_API_KEY set→ the Claude adapter (a real LLM drive).
 *
 * Point it at your own app with PROOFKEEPER_DEMO_URL / PROOFKEEPER_DEMO_GOAL;
 * otherwise it serves the bundled demo product page. Output: demo/out/drive.webm
 * (convert to GIF with ffmpeg — see demo/README.md).
 */

import { createServer, type Server } from "node:http";
import { readFile, mkdir, readdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { AutonomousDriver } from "../src/agent/drive.js";
import type { ModelClient, ModelRequest, ModelResponse } from "../src/agent/model.js";
import { CodegenCompiler } from "../src/compiler/compiler.js";
import { OpenAICompatibleModelClient } from "../src/agent/adapters/openai.js";
import { ClaudeModelClient } from "../src/agent/adapters/claude.js";

const productHtml = fileURLToPath(new URL("../examples/product/index.html", import.meta.url));
const outDir = fileURLToPath(new URL("./out", import.meta.url));

/** A scripted model: assert the start state, click Verify, then assert + finish. */
class VerifyFlowModel implements ModelClient {
  complete(request: ModelRequest): Promise<ModelResponse> {
    const last = [...request.transcript].reverse().find((m) => m.role === "user")?.content ?? "";
    const verified = last.includes("verified") && !last.includes("unverified");
    if (verified) {
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

/** Pick the model from the environment; scripted by default (deterministic). */
function resolveModel(): { model: ModelClient; label: string } {
  if (process.env.OPENAI_API_KEY) {
    return {
      model: new OpenAICompatibleModelClient({
        ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
        ...(process.env.OPENAI_MODEL ? { model: process.env.OPENAI_MODEL } : {}),
      }),
      label: `OpenAI-compatible (${process.env.OPENAI_MODEL ?? "gpt-4o"})`,
    };
  }
  if (process.env.ANTHROPIC_API_KEY) return { model: new ClaudeModelClient(), label: "Claude" };
  return { model: new VerifyFlowModel(), label: "scripted (deterministic, no key)" };
}

function log(step: string, detail = ""): void {
  process.stdout.write(`\x1b[36m▸ ${step}\x1b[0m ${detail}\n`);
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  // Target: your own app via PROOFKEEPER_DEMO_URL, or the bundled demo page.
  let server: Server | undefined;
  let baseURL = process.env.PROOFKEEPER_DEMO_URL ?? "";
  if (!baseURL) {
    const html = await readFile(productHtml, "utf8");
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    const addr = server.address();
    if (typeof addr === "string" || addr === null) throw new Error("no server address");
    baseURL = `http://127.0.0.1:${addr.port}/`;
  }
  const goal =
    process.env.PROOFKEEPER_DEMO_GOAL ?? "Click Verify and confirm the status changes to 'verified'.";

  const { model, label } = resolveModel();
  log("target", baseURL);
  log("model", label);

  // slowMo spaces the actions so the recording is watchable; recordVideo captures it.
  const browser = await chromium.launch({ slowMo: 750 });
  const context = await browser.newContext({
    viewport: { width: 900, height: 560 },
    recordVideo: { dir: outDir, size: { width: 900, height: 560 } },
  });
  const page = await context.newPage();

  log("drive", "capability REQ-DEMO-VERIFY");
  const driver = new AutonomousDriver(page, model, {
    capabilityId: "REQ-DEMO-VERIFY",
    title: "verify flips status to verified",
    startUrl: baseURL,
    goal,
  });
  const { session, finished, steps } = await driver.drive();
  log("recorded", `${session.actions.length} actions, finished=${finished}, ${steps} model turns`);

  await page.waitForTimeout(1500); // hold on the final state for the recording
  await context.close(); // finalizes the webm
  await browser.close();
  if (server) await new Promise<void>((r) => server!.close(() => r()));

  log("compile", "session → deterministic Playwright spec");
  const candidate = await new CodegenCompiler({ outDir: "examples/generated/demo" }).compile(session);
  log("spec", candidate.specPath);

  const files = (await readdir(outDir)).filter((f) => f.endsWith(".webm"));
  if (files[0]) {
    await rename(`${outDir}/${files[0]}`, `${outDir}/drive.webm`);
    log("video", "demo/out/drive.webm");
  }
  log("done", "convert to GIF with ffmpeg — see demo/README.md");
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
