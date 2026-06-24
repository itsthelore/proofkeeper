import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

function captureStdout(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    calls.push(String(chunk));
    return true;
  });
  return { calls, restore: () => spy.mockRestore() };
}

function captureStderr(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    calls.push(String(chunk));
    return true;
  });
  return { calls, restore: () => spy.mockRestore() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("proofkeeper coverage exit codes", () => {
  it("exits 1 when capabilities are unverified", async () => {
    const out = captureStdout();
    const code = await main(["coverage", "--graph-file", fixture("graph-mixed.json")]);
    out.restore();
    expect(code).toBe(1);
    expect(out.calls.join("")).toContain("REQ-SEARCH");
  });

  it("exits 0 when every capability is verified", async () => {
    const out = captureStdout();
    const code = await main(["coverage", "--graph-file", fixture("graph-all-verified.json")]);
    out.restore();
    expect(code).toBe(0);
  });

  it("exits 0 when there are no capabilities to verify", async () => {
    const out = captureStdout();
    const code = await main(["coverage", "--graph-file", fixture("graph-no-capabilities.json")]);
    out.restore();
    expect(code).toBe(0);
  });

  it("emits valid JSON under --json", async () => {
    const out = captureStdout();
    const code = await main(["coverage", "--graph-file", fixture("graph-mixed.json"), "--json"]);
    out.restore();
    expect(code).toBe(1);
    const payload = JSON.parse(out.calls.join(""));
    expect(payload.schema_version).toBe("1");
    expect(payload.unverified).toHaveLength(1);
  });
});

describe("proofkeeper usage errors (exit 2)", () => {
  it("rejects coverage with no source", async () => {
    const err = captureStderr();
    const code = await main(["coverage"]);
    err.restore();
    expect(code).toBe(2);
    expect(err.calls.join("")).toContain("requires --graph-file");
  });

  it("rejects an unknown command", async () => {
    const err = captureStderr();
    const code = await main(["frobnicate"]);
    err.restore();
    expect(code).toBe(2);
  });

  it("rejects an unreadable graph file with a parse error (exit 2)", async () => {
    const err = captureStderr();
    const code = await main(["coverage", "--graph-file", "/no/such/file.json"]);
    err.restore();
    expect(code).toBe(2);
    expect(err.calls.join("")).toContain("could not read graph file");
  });

  it("shows help and exits 0 for --help", async () => {
    const out = captureStdout();
    const code = await main(["--help"]);
    out.restore();
    expect(code).toBe(0);
    expect(out.calls.join("")).toContain("Usage:");
  });
});
