/**
 * A hand-seeded example test — the v0.0.1 stand-in for the (deferred)
 * session→test compiler.
 *
 * Its purpose is to exercise the runner and the fidelity gate with a real,
 * stable Playwright test while the moat (faithful session→test compilation,
 * Initiative 2) is still being built. It is deliberately self-contained and
 * deterministic so it re-runs green N times — exactly what the fidelity gate
 * demands of a trustworthy, committed test.
 *
 * Replace this with compiler-emitted specs once Initiative 2 lands.
 */

import { expect, test } from "@playwright/test";

test("seed: a compiled test re-runs green and stable", async () => {
  // Stand in for a driven product interaction. Deterministic by design so the
  // fidelity gate (N green re-runs) accepts it.
  const observed = 2 + 2;
  expect(observed).toBe(4);
});
