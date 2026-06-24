/**
 * The deterministic session→test emitter (Proofkeeper Initiative 2, the moat).
 *
 * Pure: a {@link RecordedSession} reduces to Playwright `.spec.ts` source with
 * no I/O and no timestamps, so the same recording always emits byte-identical
 * code. That determinism is what makes the emitted test reviewable and lets the
 * fidelity gate's re-runs mean something — nothing varies between compile runs.
 *
 * The start URL is emitted as `process.env.PROOFKEEPER_BASE_URL ?? <recorded>`
 * so the compiled test re-runs against whatever target the runner injects
 * (dev, prod) while still being runnable standalone.
 */

import type { Action, Locator, RecordedSession } from "./actions.js";

/** Single-quoted string literal with deterministic escaping. */
function lit(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `'${escaped}'`;
}

function locatorExpr(loc: Locator): string {
  switch (loc.kind) {
    case "role":
      return loc.name !== undefined
        ? `page.getByRole(${lit(loc.role)}, { name: ${lit(loc.name)} })`
        : `page.getByRole(${lit(loc.role)})`;
    case "testId":
      return `page.getByTestId(${lit(loc.testId)})`;
    case "text":
      return `page.getByText(${lit(loc.text)})`;
    case "label":
      return `page.getByLabel(${lit(loc.label)})`;
    case "css":
      return `page.locator(${lit(loc.selector)})`;
  }
}

function actionStmt(action: Action, startUrl: string): string {
  switch (action.type) {
    case "goto":
      return action.url === startUrl
        ? `await page.goto(BASE);`
        : `await page.goto(${lit(action.url)});`;
    case "click":
      return `await ${locatorExpr(action.locator)}.click();`;
    case "fill":
      return `await ${locatorExpr(action.locator)}.fill(${lit(action.value)});`;
    case "check":
      return `await ${locatorExpr(action.locator)}.check();`;
    case "press":
      return `await ${locatorExpr(action.locator)}.press(${lit(action.key)});`;
    case "expectText":
      return `await expect(${locatorExpr(action.locator)}).toHaveText(${lit(action.text)});`;
    case "expectVisible":
      return `await expect(${locatorExpr(action.locator)}).toBeVisible();`;
  }
}

/**
 * Emit Playwright `.spec.ts` source for a recorded session.
 *
 * @throws {Error} when the session recorded no actions — an empty test
 *   verifies nothing and must not be emitted.
 */
export function emitSpec(session: RecordedSession): string {
  if (session.actions.length === 0) {
    throw new Error("refusing to emit a test from a session with no recorded actions");
  }

  const provenance = session.capabilityId
    ? ` for capability ${session.capabilityId}`
    : "";
  const body = session.actions
    .map((a) => `  ${actionStmt(a, session.startUrl)}`)
    .join("\n");

  return `// Compiled by Lore Proofkeeper from a recorded drive session${provenance}.
// Do not edit by hand: re-compile the session to regenerate. Deterministic
// (no timestamps) so it is stable to review and re-run.
import { expect, test } from "@playwright/test";

const BASE = process.env.PROOFKEEPER_BASE_URL ?? ${lit(session.startUrl)};

test(${lit(session.title)}, async ({ page }) => {
${body}
});
`;
}
