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

function outputMatchStmt(action: Extract<Action, { type: "expectOutput" }>): string {
  const stream = `last.${action.stream}`;
  switch (action.match) {
    case "exact":
      return `expect(${stream}.trim()).toBe(${lit(action.value)});`;
    case "contains":
      return `expect(${stream}).toContain(${lit(action.value)});`;
    case "regex":
      return `expect(${stream}).toMatch(new RegExp(${lit(action.value)}));`;
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
    case "run":
      return action.cwd !== undefined
        ? `last = runCommand(${lit(action.command)}, { cwd: ${lit(action.cwd)} });`
        : `last = runCommand(${lit(action.command)});`;
    case "expectOutput":
      return outputMatchStmt(action);
    case "expectExit":
      return `expect(last.code).toBe(${action.code});`;
    case "request":
      return `httpRes = await httpRequest(${requestInputLit(action)});`;
    case "expectStatus":
      return `expect(httpRes.status).toBe(${action.status});`;
    case "expectJson":
      return `expect(jsonPath(JSON.parse(httpRes.body), ${lit(action.path)})).toBe(${jsonScalarLit(action.equals)});`;
  }
}

/** Emit a JSON scalar as a TypeScript literal. */
function jsonScalarLit(value: string | number | boolean): string {
  return typeof value === "string" ? lit(value) : String(value);
}

/** Emit a request input object literal. */
function requestInputLit(action: Extract<Action, { type: "request" }>): string {
  const parts = [`method: ${lit(action.method)}`, `url: ${lit(action.url)}`];
  if (action.headers) {
    const entries = Object.entries(action.headers)
      .map(([k, v]) => `${lit(k)}: ${lit(v)}`)
      .join(", ");
    parts.push(`headers: { ${entries} }`);
  }
  if (action.body !== undefined) parts.push(`body: ${lit(action.body)}`);
  return `{ ${parts.join(", ")} }`;
}

/** True when the session drives the terminal — needs the runCommand helper. */
function usesTerminal(session: RecordedSession): boolean {
  return session.actions.some(
    (a) => a.type === "run" || a.type === "expectOutput" || a.type === "expectExit",
  );
}

/** True when the session drives HTTP — needs the httpRequest/jsonPath helpers. */
function usesHttp(session: RecordedSession): boolean {
  return session.actions.some(
    (a) => a.type === "request" || a.type === "expectStatus" || a.type === "expectJson",
  );
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
  const terminal = usesTerminal(session);
  const http = usesHttp(session);

  const imports = [
    `import { expect, test } from "@playwright/test";`,
    ...(terminal ? [`import { spawnSync } from "node:child_process";`] : []),
  ].join("\n");

  // Inlined so the compiled spec is standalone; each mirrors its src/compiler
  // helper exactly, so a recording that held re-runs green.
  const terminalHelper = terminal
    ? `\nfunction runCommand(command: string, options: { cwd?: string } = {}) {
  const r = spawnSync(command, { shell: true, encoding: "utf8", ...options });
  if (r.error) throw r.error;
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", code: r.status ?? 0 };
}\n`
    : "";
  const httpHelper = http
    ? `\nasync function httpRequest(input) {
  const r = await fetch(input.url, { method: input.method, ...(input.headers ? { headers: input.headers } : {}), ...(input.body !== undefined ? { body: input.body } : {}) });
  return { status: r.status, body: await r.text() };
}
function jsonPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc != null && typeof acc === "object" ? acc[key] : undefined), obj);
}\n`
    : "";
  const helper = `${terminalHelper}${httpHelper}`;

  const firstStmt =
    (terminal ? `  let last: { stdout: string; stderr: string; code: number };\n` : "") +
    (http ? `  let httpRes: { status: number; body: string };\n` : "");
  const body = session.actions
    .map((a) => `  ${actionStmt(a, session.startUrl)}`)
    .join("\n");

  return `// Compiled by Lore Proofkeeper from a recorded drive session${provenance}.
// Do not edit by hand: re-compile the session to regenerate. Deterministic
// (no timestamps) so it is stable to review and re-run.
${imports}

const BASE = process.env.PROOFKEEPER_BASE_URL ?? ${lit(session.startUrl)};
${helper}
test(${lit(session.title)}, async ({ page }) => {
${firstStmt}${body}
});
`;
}
