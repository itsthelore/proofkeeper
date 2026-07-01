/**
 * The drive's trust boundary: egress policy (shell gating + URL allowlist) and
 * the tool surface it shapes. Page content is untrusted input; these tests pin
 * that an injected instruction cannot reach the shell or arbitrary hosts.
 */

import { describe, it, expect } from "vitest";

import { buildPolicy, urlRefusal, callRefusal, SHELL_TOOL_NAMES } from "../src/agent/policy.js";
import { toolsForPolicy, DRIVE_TOOLS } from "../src/agent/tools.js";

describe("buildPolicy", () => {
  it("defaults to shell off with only the start URL's origin allowed", () => {
    const policy = buildPolicy({ startUrl: "https://app.example.com:8443/login?next=/home" });
    expect(policy.allowShell).toBe(false);
    expect(policy.allowedOrigins).toEqual(["https://app.example.com:8443"]);
    expect(policy.allowedHosts).toEqual([]);
  });

  it("adds the loaded extension's origin", () => {
    const policy = buildPolicy({
      startUrl: "http://localhost:3000/",
      extensionBase: "chrome-extension://abcdefghijklmnop/",
    });
    expect(policy.allowedOrigins).toEqual(["http://localhost:3000", "chrome-extension://abcdefghijklmnop"]);
    // One extension's pages are allowed; another extension's are not.
    expect(urlRefusal("chrome-extension://abcdefghijklmnop/popup.html", policy)).toBeUndefined();
    expect(urlRefusal("chrome-extension://qrstuvwxyzabcdef/popup.html", policy)).toContain("not allowed");
  });

  it("carries the caller's opt-ins", () => {
    const policy = buildPolicy({
      startUrl: "http://localhost:3000/",
      allowShell: true,
      allowedHosts: ["api.example.com"],
    });
    expect(policy.allowShell).toBe(true);
    expect(policy.allowedHosts).toEqual(["api.example.com"]);
  });

  it("tolerates an unparseable start URL (navigation fails, not policy construction)", () => {
    const policy = buildPolicy({ startUrl: "not a url" });
    expect(policy.allowedOrigins).toEqual([]);
  });
});

describe("urlRefusal", () => {
  const policy = buildPolicy({ startUrl: "http://localhost:3000/", allowedHosts: ["api.example.com"] });

  it("allows the start origin and allowlisted hosts", () => {
    expect(urlRefusal("http://localhost:3000/orders", policy)).toBeUndefined();
    expect(urlRefusal("https://api.example.com/v1/orders", policy)).toBeUndefined();
  });

  it("refuses other origins — including cloud metadata and internal targets", () => {
    expect(urlRefusal("http://169.254.169.254/latest/meta-data/", policy)).toContain("not allowed");
    expect(urlRefusal("http://localhost:9200/_cat/indices", policy)).toContain("not allowed");
    expect(urlRefusal("https://evil.example.net/exfil", policy)).toContain("not allowed");
  });

  it("refuses a same-host different-port origin unless the host is allowlisted", () => {
    // localhost:3000 is the origin; localhost:9200 is a different origin.
    expect(urlRefusal("http://localhost:9200/", policy)).toContain("not allowed");
    // api.example.com is allowlisted by hostname, so any port passes.
    expect(urlRefusal("https://api.example.com:8443/v1", policy)).toBeUndefined();
  });

  it("refuses non-absolute URLs", () => {
    expect(urlRefusal("/relative/path", policy)).toContain("not an absolute URL");
  });
});

describe("callRefusal", () => {
  it("refuses every shell tool when the shell is not allowed", () => {
    const policy = buildPolicy({ startUrl: "http://localhost:3000/" });
    for (const name of SHELL_TOOL_NAMES) {
      expect(callRefusal({ name, arguments: {} }, policy)).toContain("shell is disabled");
    }
  });

  it("dispatches shell tools when the operator opted in", () => {
    const policy = buildPolicy({ startUrl: "http://localhost:3000/", allowShell: true });
    expect(callRefusal({ name: "run_command", arguments: { command: "ls" } }, policy)).toBeUndefined();
  });

  it("gates navigate and request URLs through the allowlist", () => {
    const policy = buildPolicy({ startUrl: "http://localhost:3000/" });
    expect(callRefusal({ name: "navigate", arguments: { url: "http://localhost:3000/a" } }, policy)).toBeUndefined();
    expect(callRefusal({ name: "navigate", arguments: { url: "https://evil.example.net/" } }, policy)).toContain(
      "not allowed",
    );
    expect(callRefusal({ name: "request", arguments: { method: "GET", url: "http://10.0.0.1/" } }, policy)).toContain(
      "not allowed",
    );
  });

  it("leaves page-scoped tools ungated", () => {
    const policy = buildPolicy({ startUrl: "http://localhost:3000/" });
    for (const name of ["click", "fill", "expect_text", "expect_visible", "finish"]) {
      expect(callRefusal({ name, arguments: {} }, policy)).toBeUndefined();
    }
  });
});

describe("toolsForPolicy", () => {
  it("withholds the terminal tools by default", () => {
    const names = toolsForPolicy({ allowShell: false }).map((t) => t.name);
    for (const shellTool of SHELL_TOOL_NAMES) expect(names).not.toContain(shellTool);
    expect(names).toContain("navigate");
    expect(names).toContain("finish");
  });

  it("advertises the full catalog when the shell is allowed", () => {
    expect(toolsForPolicy({ allowShell: true })).toEqual([...DRIVE_TOOLS]);
  });
});
