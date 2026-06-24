import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PlaywrightRunner } from "../src/runner/playwright-runner.js";
import { assessFidelity } from "../src/fidelity/gate.js";
import type { CompiledTest } from "../src/runner/types.js";

/**
 * End-to-end runner tests that launch a real browser. Gated behind
 * PROOFKEEPER_E2E so the default unit run stays fast and browser-free; the CI
 * e2e job installs Chromium and sets the flag. Browser launch is slow, hence
 * the generous timeouts.
 */
const e2e = process.env.PROOFKEEPER_E2E ? describe : describe.skip;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const SEED: CompiledTest = { id: "seed", specPath: "examples/seed.spec.ts", title: "seed" };
const TARGET = { name: "local", baseURL: "http://localhost" };

e2e("PlaywrightRunner (real browser)", () => {
  it(
    "runs the seed spec green and emits a replayable trace",
    async () => {
      const runner = new PlaywrightRunner({ cwd: projectRoot });
      const [result] = await runner.run([SEED], { targets: [TARGET] });

      expect(result?.status).toBe("passed");
      expect(result?.durationMs).toBeGreaterThan(0);
      expect(result?.tracePath).toBeTruthy();
      expect(existsSync(result!.tracePath!)).toBe(true);
    },
    120_000,
  );

  it(
    "passes the fidelity gate over 3 green re-runs",
    async () => {
      const runner = new PlaywrightRunner({ cwd: projectRoot });
      const verdict = await assessFidelity(runner, SEED, { n: 3, target: TARGET });

      expect(verdict.stable).toBe(true);
      expect(verdict.passed).toBe(3);
    },
    300_000,
  );
});
