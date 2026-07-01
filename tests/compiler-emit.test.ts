import { describe, expect, it } from "vitest";

import type { RecordedSession } from "../src/compiler/actions.js";
import { emitSpec } from "../src/compiler/emit.js";

const session: RecordedSession = {
  capabilityId: "REQ-LOGIN",
  title: "user can log in",
  startUrl: "http://localhost:3000/",
  actions: [
    { type: "goto", url: "http://localhost:3000/" },
    { type: "fill", locator: { kind: "label", label: "Email" }, value: "a@b.com" },
    { type: "fill", locator: { kind: "label", label: "Password" }, value: "secret's" },
    { type: "click", locator: { kind: "role", role: "button", name: "Log in" } },
    { type: "expectText", locator: { kind: "testId", testId: "status" }, text: "Signed in" },
    { type: "expectVisible", locator: { kind: "css", selector: ".dashboard" } },
  ],
};

describe("emitSpec", () => {
  it("emits runnable Playwright source with codegen-style locators", () => {
    const src = emitSpec(session);
    expect(src).toContain(`import { expect, test } from "@playwright/test";`);
    expect(src).toContain(`test('user can log in', async ({ page }) => {`);
    expect(src).toContain(`await page.goto(BASE);`);
    expect(src).toContain(`await page.getByLabel('Email', { exact: true }).fill('a@b.com');`);
    expect(src).toContain(`await page.getByRole('button', { name: 'Log in', exact: true }).click();`);
    expect(src).toContain(`await expect(page.getByTestId('status')).toHaveText('Signed in');`);
    expect(src).toContain(`await expect(page.locator('.dashboard')).toBeVisible();`);
  });

  it("threads the start URL through PROOFKEEPER_BASE_URL", () => {
    expect(emitSpec(session)).toContain(
      `const BASE = process.env.PROOFKEEPER_BASE_URL ?? 'http://localhost:3000/';`,
    );
  });

  it("records the capability id in the provenance header", () => {
    expect(emitSpec(session)).toContain("for capability REQ-LOGIN");
  });

  it("escapes string literals safely (apostrophes)", () => {
    expect(emitSpec(session)).toContain(`.fill('secret\\'s');`);
  });

  it("is deterministic — identical input emits byte-identical output", () => {
    expect(emitSpec(session)).toBe(emitSpec(session));
  });

  it("refuses to emit a test from a session with no actions", () => {
    expect(() => emitSpec({ ...session, actions: [] })).toThrow(/no recorded actions/);
  });

  it("refuses to emit a test from a session with no assertions", () => {
    // Navigation and clicks alone compile to a trivially-green spec that
    // verifies nothing — such a session must never reach the fidelity gate.
    const assertionFree: RecordedSession = {
      ...session,
      actions: [
        { type: "goto", url: "http://x/" },
        { type: "click", locator: { kind: "testId", testId: "go" } },
      ],
    };
    expect(() => emitSpec(assertionFree)).toThrow(/no recorded assertions/);
  });

  it("does not switch to extension mode for a normal session", () => {
    const src = emitSpec(session);
    expect(src).toContain(`async ({ page }) => {`);
    expect(src).not.toContain("launchPersistentContext");
    expect(src).not.toContain("chromium");
  });
});

describe("emitSpec — browser-extension mode", () => {
  const extSession: RecordedSession = {
    capabilityId: "REQ-EXT",
    title: "extension flips the badge",
    startUrl: "http://localhost:3000/",
    extensionPath: "./my-ext",
    actions: [
      { type: "goto", url: "http://localhost:3000/" },
      { type: "goto", url: "chrome-extension://oldrecordedidoldrecordedid000000/popup.html" },
      { type: "click", locator: { kind: "role", role: "button", name: "Enable" } },
      { type: "expectText", locator: { kind: "testId", testId: "badge" }, text: "on" },
    ],
  };

  it("launches a persistent context with the unpacked extension loaded", () => {
    const src = emitSpec(extSession);
    expect(src).toContain(`import { chromium, expect, test } from "@playwright/test";`);
    expect(src).toContain(`test('extension flips the badge', async () => {`);
    expect(src).toContain("chromium.launchPersistentContext");
    expect(src).toContain(`channel: "chromium"`);
    expect(src).toContain("--load-extension=${EXTENSION_PATH}");
    expect(src).toContain("--disable-extensions-except=${EXTENSION_PATH}");
    expect(src).toContain(`const EXTENSION_PATH = process.env.PROOFKEEPER_EXTENSION_PATH ?? './my-ext';`);
  });

  it("rediscovers the extension id at runtime and rewrites chrome-extension gotos", () => {
    const src = emitSpec(extSession);
    expect(src).toContain(`await context.waitForEvent("serviceworker")`);
    expect(src).toContain("const extId = new URL(worker.url()).host;");
    // The stale recorded id is never emitted; the goto uses the runtime extId.
    expect(src).not.toContain("oldrecordedidoldrecordedid000000");
    expect(src).toContain("await page.goto(`chrome-extension://${extId}/popup.html`);");
  });

  it("still maps the start URL to BASE and closes the context", () => {
    const src = emitSpec(extSession);
    expect(src).toContain("await page.goto(BASE);");
    expect(src).toContain("await context.close();");
  });

  it("is deterministic in extension mode", () => {
    expect(emitSpec(extSession)).toBe(emitSpec(extSession));
  });
});
