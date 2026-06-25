import { describe, expect, it } from "vitest";

import { parseConfig, ConfigParseError } from "../src/scope/config.js";

describe("parseConfig", () => {
  it("parses capabilities with paths and optional fields", () => {
    const cfg = parseConfig(
      JSON.stringify({
        capabilities: [
          { id: "REQ-A", paths: ["src/a/**"] },
          { id: "REQ-B", paths: ["src/b/**", "api/b.ts"], url: "http://b/", goal: "verify B", artifact: "rac/b.md" },
        ],
      }),
    );
    expect(cfg.capabilities).toHaveLength(2);
    expect(cfg.capabilities[0]).toEqual({ id: "REQ-A", paths: ["src/a/**"] });
    expect(cfg.capabilities[1]).toEqual({
      id: "REQ-B",
      paths: ["src/b/**", "api/b.ts"],
      url: "http://b/",
      goal: "verify B",
      artifact: "rac/b.md",
    });
  });

  it("rejects invalid JSON", () => {
    expect(() => parseConfig("{not json")).toThrow(ConfigParseError);
  });

  it("rejects a missing capabilities array", () => {
    expect(() => parseConfig(JSON.stringify({}))).toThrow(/capabilities/);
  });

  it("rejects a capability without an id or paths", () => {
    expect(() => parseConfig(JSON.stringify({ capabilities: [{ paths: ["x"] }] }))).toThrow(/id/);
    expect(() => parseConfig(JSON.stringify({ capabilities: [{ id: "REQ-A", paths: [] }] }))).toThrow(/paths/);
    expect(() => parseConfig(JSON.stringify({ capabilities: [{ id: "REQ-A" }] }))).toThrow(/paths/);
  });
});
