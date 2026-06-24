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
    expect(src).toContain(`await page.getByLabel('Email').fill('a@b.com');`);
    expect(src).toContain(`await page.getByRole('button', { name: 'Log in' }).click();`);
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
});
