/**
 * A hand-seeded example test — the v0.0.1 stand-in for the (deferred)
 * session→test compiler.
 *
 * Its purpose is to exercise the real runner and the fidelity gate with a
 * genuine browser-driven Playwright test while the moat (faithful session→test
 * compilation, Initiative 2) is still being built.
 *
 * It is deliberately hermetic: the "product" is mounted with `page.setContent`
 * rather than fetched over the network, so the test is fully offline and
 * deterministic and re-runs green N times — exactly what the fidelity gate
 * demands of a trustworthy, committed test. Replace this with compiler-emitted
 * specs (driving the real product over its baseURL) once Initiative 2 lands.
 */

import { expect, test } from "@playwright/test";

const PRODUCT_HTML = `
  <!doctype html>
  <html>
    <head><title>Proofkeeper seed</title></head>
    <body>
      <h1 id="heading">Lore Proofkeeper</h1>
      <button id="verify">Verify</button>
      <p id="status">unverified</p>
      <script>
        document.getElementById('verify').addEventListener('click', () => {
          document.getElementById('status').textContent = 'verified';
        });
      </script>
    </body>
  </html>
`;

test("seed: drives a browser and the verify interaction holds", async ({ page }) => {
  // Mount the stand-in product in a real browser page.
  await page.setContent(PRODUCT_HTML);

  // Drive it the way a developer would, then assert the resulting state.
  await expect(page.locator("#heading")).toHaveText("Lore Proofkeeper");
  await expect(page.locator("#status")).toHaveText("unverified");

  await page.locator("#verify").click();

  await expect(page.locator("#status")).toHaveText("verified");
});
