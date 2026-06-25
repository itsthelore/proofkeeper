import { describe, expect, it } from "vitest";

import type { RecordedSession } from "../src/compiler/actions.js";
import { emitSpec } from "../src/compiler/emit.js";

const terminalSession: RecordedSession = {
  capabilityId: "REQ-CLI",
  title: "cli prints the order number",
  startUrl: "about:blank",
  actions: [
    { type: "goto", url: "about:blank" },
    { type: "run", command: "node -e \"console.log('order-123')\"" },
    { type: "expectOutput", match: "contains", stream: "stdout", value: "order-123" },
    { type: "expectExit", code: 0 },
    { type: "run", command: "ls", cwd: "/tmp" },
    { type: "expectOutput", match: "exact", stream: "stdout", value: "exactly" },
    { type: "expectOutput", match: "regex", stream: "stderr", value: "warn.*" },
  ],
};

describe("emitSpec — terminal actions", () => {
  it("imports child_process and inlines the runCommand helper only when terminal actions exist", () => {
    const src = emitSpec(terminalSession);
    expect(src).toContain(`import { spawnSync } from "node:child_process";`);
    expect(src).toContain("function runCommand(command: string, options: { cwd?: string } = {})");
    expect(src).toContain("let last: { stdout: string; stderr: string; code: number };");
  });

  it("does NOT include the terminal helper for a browser-only session", () => {
    const browserOnly: RecordedSession = {
      title: "browser only",
      startUrl: "http://x/",
      actions: [{ type: "goto", url: "http://x/" }, { type: "click", locator: { kind: "testId", testId: "go" } }],
    };
    const src = emitSpec(browserOnly);
    expect(src).not.toContain("node:child_process");
    expect(src).not.toContain("runCommand");
  });

  it("emits run with and without cwd (single quotes escaped, double quotes left as-is)", () => {
    const src = emitSpec(terminalSession);
    expect(src).toContain(`last = runCommand('node -e "console.log(\\'order-123\\')"');`);
    expect(src).toContain(`last = runCommand('ls', { cwd: '/tmp' });`);
  });

  it("emits the three output-match shapes and the exit assertion", () => {
    const src = emitSpec(terminalSession);
    expect(src).toContain(`expect(last.stdout).toContain('order-123');`);
    expect(src).toContain(`expect(last.code).toBe(0);`);
    expect(src).toContain(`expect(last.stdout.trim()).toBe('exactly');`);
    expect(src).toContain(`expect(last.stderr).toMatch(new RegExp('warn.*'));`);
  });

  it("is deterministic for terminal sessions too", () => {
    expect(emitSpec(terminalSession)).toBe(emitSpec(terminalSession));
  });
});
