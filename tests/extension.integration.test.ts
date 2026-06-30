import { fileURLToPath } from "node:url";
import { expect as pwExpect } from "@playwright/test";
import { describe, expect, it } from "vitest";

import { loadExtension } from "../src/agent/extension.js";

/**
 * End-to-end extension test that launches a real persistent Chromium context
 * with an unpacked extension loaded. Gated behind PROOFKEEPER_E2E so the default
 * unit run stays fast and browser-free; the CI e2e job installs Chromium and
 * sets the flag. Browser launch is slow, hence the generous timeout.
 */
const e2e = process.env.PROOFKEEPER_E2E ? describe : describe.skip;

const extensionDir = fileURLToPath(new URL("./fixtures/extension", import.meta.url));

e2e("browser-extension drive (real browser)", () => {
  it(
    "loads the extension, discovers its id, and drives the popup",
    async () => {
      const { chromium } = await import("@playwright/test");
      const context = await chromium.launchPersistentContext("", {
        channel: "chromium",
        args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
      });
      try {
        const { id, base } = await loadExtension(context);
        expect(id).toMatch(/^[a-p]+$/); // Chromium extension ids are a–p
        expect(base).toBe(`chrome-extension://${id}/`);

        const page = context.pages()[0] ?? (await context.newPage());
        await page.goto(`${base}popup.html`);
        await pwExpect(page.getByTestId("status")).toHaveText("off");
        await page.getByRole("button", { name: "Enable" }).click();
        await pwExpect(page.getByTestId("status")).toHaveText("on");
      } finally {
        await context.close();
      }
    },
    60_000,
  );
});
