import { describe, expect, it } from "vitest";

import {
  DRIVE_TOOLS,
  parseLocator,
  parseRunCommand,
  parseExpectOutput,
  parseExpectExit,
  ToolArgumentError,
} from "../src/agent/tools.js";

describe("DRIVE_TOOLS", () => {
  it("advertises the browser and terminal tools that map to recorder actions, plus finish", () => {
    const names = DRIVE_TOOLS.map((t) => t.name);
    expect(names).toEqual([
      "navigate",
      "click",
      "fill",
      "check",
      "press",
      "expect_text",
      "expect_visible",
      "run_command",
      "expect_output",
      "expect_exit",
      "finish",
    ]);
    expect(DRIVE_TOOLS.every((t) => t.description.length > 0)).toBe(true);
  });
});

describe("parseLocator", () => {
  it("parses a role locator with a name", () => {
    expect(parseLocator({ locator: { strategy: "role", role: "button", name: "Verify" } })).toEqual({
      kind: "role",
      role: "button",
      name: "Verify",
    });
  });

  it("parses a role locator without a name", () => {
    expect(parseLocator({ locator: { strategy: "role", role: "heading" } })).toEqual({
      kind: "role",
      role: "heading",
    });
  });

  it("accepts the locator inline on the arguments object", () => {
    expect(parseLocator({ strategy: "testId", testId: "status" })).toEqual({
      kind: "testId",
      testId: "status",
    });
  });

  it("parses text, label, and css strategies", () => {
    expect(parseLocator({ strategy: "text", text: "Sign in" })).toEqual({ kind: "text", text: "Sign in" });
    expect(parseLocator({ strategy: "label", label: "Email" })).toEqual({ kind: "label", label: "Email" });
    expect(parseLocator({ strategy: "css", selector: ".x" })).toEqual({ kind: "css", selector: ".x" });
  });

  it("rejects an unknown strategy", () => {
    expect(() => parseLocator({ strategy: "magic" })).toThrow(ToolArgumentError);
  });

  it("rejects a missing required field", () => {
    expect(() => parseLocator({ strategy: "role" })).toThrow(ToolArgumentError);
  });
});

describe("parseRunCommand", () => {
  it("parses a command with an optional cwd", () => {
    expect(parseRunCommand({ command: "npm test" })).toEqual({ command: "npm test" });
    expect(parseRunCommand({ command: "ls", cwd: "/tmp" })).toEqual({ command: "ls", cwd: "/tmp" });
  });

  it("rejects a missing command", () => {
    expect(() => parseRunCommand({ cwd: "/tmp" })).toThrow(ToolArgumentError);
  });
});

describe("parseExpectOutput", () => {
  it("parses a valid output assertion", () => {
    expect(parseExpectOutput({ match: "contains", stream: "stdout", value: "ok" })).toEqual({
      match: "contains",
      stream: "stdout",
      value: "ok",
    });
  });

  it("rejects an unknown match mode or stream", () => {
    expect(() => parseExpectOutput({ match: "fuzzy", stream: "stdout", value: "x" })).toThrow(ToolArgumentError);
    expect(() => parseExpectOutput({ match: "exact", stream: "stdlog", value: "x" })).toThrow(ToolArgumentError);
  });
});

describe("parseExpectExit", () => {
  it("parses an integer exit code", () => {
    expect(parseExpectExit({ code: 0 })).toBe(0);
    expect(parseExpectExit({ code: 2 })).toBe(2);
  });

  it("rejects a non-integer code", () => {
    expect(() => parseExpectExit({ code: "0" })).toThrow(ToolArgumentError);
    expect(() => parseExpectExit({ code: 1.5 })).toThrow(ToolArgumentError);
  });
});
