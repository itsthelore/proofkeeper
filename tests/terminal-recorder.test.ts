import { describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";

import { Recorder } from "../src/compiler/recorder.js";

/**
 * The terminal half of the recorder runs real commands via spawnSync and never
 * touches the page, so these are hermetic (no browser) and run under `npm test`.
 * The page is a stub that would throw if any browser method were called.
 */
function terminalRecorder(): Recorder {
  const page = {} as unknown as Page;
  return new Recorder(page, { title: "cli check", startUrl: "about:blank" });
}

describe("Recorder — terminal actions", () => {
  it("runs a command, records it, and returns its result", async () => {
    const rec = terminalRecorder();
    const result = await rec.run("node -e \"console.log('hi')\"");
    expect(result.stdout.trim()).toBe("hi");
    expect(result.code).toBe(0);
    expect(rec.recording().actions).toEqual([
      { type: "run", command: "node -e \"console.log('hi')\"" },
    ]);
  });

  it("records the cwd when given", async () => {
    const rec = terminalRecorder();
    await rec.run("node -e \"process.stdout.write('x')\"", { cwd: process.cwd() });
    expect(rec.recording().actions[0]).toEqual({
      type: "run",
      command: "node -e \"process.stdout.write('x')\"",
      cwd: process.cwd(),
    });
  });

  it("records an output assertion only when it holds", async () => {
    const rec = terminalRecorder();
    await rec.run("node -e \"console.log('order-42')\"");
    await rec.expectOutput({ match: "contains", stream: "stdout", value: "order-42" });
    await rec.expectOutput({ match: "regex", stream: "stdout", value: "order-\\d+" });
    expect(rec.recording().actions.filter((a) => a.type === "expectOutput")).toHaveLength(2);
  });

  it("throws and does not record a failing output assertion", async () => {
    const rec = terminalRecorder();
    await rec.run("node -e \"console.log('hi')\"");
    await expect(rec.expectOutput({ match: "exact", stream: "stdout", value: "bye" })).rejects.toThrow(
      /output assertion failed/,
    );
    expect(rec.recording().actions.some((a) => a.type === "expectOutput")).toBe(false);
  });

  it("asserts and records an exit code, and rejects a mismatch", async () => {
    const rec = terminalRecorder();
    await rec.run("node -e \"process.exit(3)\"");
    await expect(rec.expectExit(0)).rejects.toThrow(/exit assertion failed/);
    await rec.expectExit(3);
    expect(rec.recording().actions.at(-1)).toEqual({ type: "expectExit", code: 3 });
  });

  it("captures stderr separately", async () => {
    const rec = terminalRecorder();
    await rec.run("node -e \"console.error('boom')\"");
    await rec.expectOutput({ match: "contains", stream: "stderr", value: "boom" });
    expect(rec.recording().actions.at(-1)).toMatchObject({ type: "expectOutput", stream: "stderr" });
  });

  it("refuses an assertion before any command has run", async () => {
    const rec = terminalRecorder();
    await expect(rec.expectOutput({ match: "contains", stream: "stdout", value: "x" })).rejects.toThrow(
      /before any run_command/,
    );
    await expect(rec.expectExit(0)).rejects.toThrow(/before any run_command/);
  });
});
