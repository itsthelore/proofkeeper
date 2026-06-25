import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";

import { createPageMonitor } from "../src/agent/observe.js";

/**
 * The richer observation captures real console and network activity from a live
 * page. Gated behind PROOFKEEPER_E2E.
 */
const e2e = process.env.PROOFKEEPER_E2E ? describe : describe.skip;

const PAGE_HTML = `<!doctype html><title>obs</title><body>
<script>
  console.log("hello from the page");
  fetch("/api/ping").then((r) => r.text());
</script>
</body>`;

e2e("createPageMonitor — captures console and network on a real page", () => {
  let server: Server;
  let baseURL: string;
  let browser: Browser;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/api/ping") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(PAGE_HTML);
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
    "records the page's console message and its API response, then stops after dispose",
    async () => {
      const page = await browser.newPage();
      const monitor = createPageMonitor(page);
      await page.goto(`${baseURL}/`);
      await page.waitForResponse((r) => r.url().endsWith("/api/ping"));

      expect(monitor.console.some((c) => c.includes("hello from the page"))).toBe(true);
      expect(monitor.network.some((n) => n.includes("/api/ping"))).toBe(true);

      monitor.dispose();
      const before = monitor.network.length;
      await page.evaluate(() => fetch("/api/ping"));
      await page.waitForTimeout(100);
      expect(monitor.network.length).toBe(before); // no capture after dispose

      await page.close();
    },
    300_000,
  );
});
