import { describe, expect, it } from "vitest";

import { extensionIdFromUrl, loadExtension } from "../src/agent/extension.js";

describe("extensionIdFromUrl", () => {
  it("extracts the id from a chrome-extension worker url", () => {
    expect(extensionIdFromUrl("chrome-extension://abcdefghijklmnopabcdefghijklmnop/background.js")).toBe(
      "abcdefghijklmnopabcdefghijklmnop",
    );
  });

  it("returns undefined for a non-extension url or garbage", () => {
    expect(extensionIdFromUrl("https://example.com/x")).toBeUndefined();
    expect(extensionIdFromUrl("not a url")).toBeUndefined();
  });
});

/** Minimal BrowserContext double exposing only what loadExtension touches. */
function fakeContext(opts: {
  serviceWorkers?: { url: () => string }[];
  backgroundPages?: { url: () => string }[];
  worker?: { url: () => string };
}) {
  return {
    serviceWorkers: () => opts.serviceWorkers ?? [],
    backgroundPages: () => opts.backgroundPages ?? [],
    waitForEvent: async (event: string) => {
      if (event !== "serviceworker" || !opts.worker) throw new Error("no worker");
      return opts.worker;
    },
  } as unknown as Parameters<typeof loadExtension>[0];
}

describe("loadExtension", () => {
  it("derives id and base from the MV3 service worker", async () => {
    const ctx = fakeContext({ serviceWorkers: [{ url: () => "chrome-extension://aaaabbbbccccddddaaaabbbbccccdddd/sw.js" }] });
    expect(await loadExtension(ctx)).toEqual({
      id: "aaaabbbbccccddddaaaabbbbccccdddd",
      base: "chrome-extension://aaaabbbbccccddddaaaabbbbccccdddd/",
    });
  });

  it("falls back to an MV2 background page", async () => {
    const ctx = fakeContext({ backgroundPages: [{ url: () => "chrome-extension://mv2mv2mv2mv2mv2mv2mv2mv2mv2mv2mv/bg.html" }] });
    expect((await loadExtension(ctx)).id).toBe("mv2mv2mv2mv2mv2mv2mv2mv2mv2mv2mv");
  });

  it("waits for a service worker when none is present yet", async () => {
    const ctx = fakeContext({ worker: { url: () => "chrome-extension://lazylazylazylazylazylazylazylaz/sw.js" } });
    expect((await loadExtension(ctx)).id).toBe("lazylazylazylazylazylazylazylaz");
  });
});
