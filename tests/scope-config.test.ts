import { describe, expect, it } from "vitest";

import { parseConfig, ConfigParseError, resolveTarget, authContext, personaContext } from "../src/scope/config.js";

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

  it("parses environments, defaultTarget, auth, and a capability environment", () => {
    const cfg = parseConfig(
      JSON.stringify({
        capabilities: [{ id: "REQ-A", paths: ["src/a/**"], environment: "production" }],
        environments: {
          development: { url: "https://dev/" },
          production: { url: "https://prod/", restrictions: ["read-only", "never create data"] },
        },
        defaultTarget: "development",
        auth: { method: "email-password", provider: "WorkOS" },
      }),
    );
    expect(cfg.environments?.production).toEqual({ url: "https://prod/", restrictions: ["read-only", "never create data"] });
    expect(cfg.defaultTarget).toBe("development");
    expect(cfg.auth).toEqual({ method: "email-password", provider: "WorkOS" });
    expect(cfg.capabilities[0]?.environment).toBe("production");
  });

  it("rejects a malformed environment or auth block", () => {
    expect(() => parseConfig(JSON.stringify({ capabilities: [{ id: "A", paths: ["x"] }], environments: { dev: {} } }))).toThrow(/url/);
    expect(() => parseConfig(JSON.stringify({ capabilities: [{ id: "A", paths: ["x"] }], auth: { provider: "x" } }))).toThrow(/method/);
  });
});

const CFG = parseConfig(
  JSON.stringify({
    capabilities: [
      { id: "REQ-EXPLICIT", paths: ["x"], url: "https://explicit/" },
      { id: "REQ-PROD", paths: ["y"], environment: "production" },
      { id: "REQ-DEFAULT", paths: ["z"] },
    ],
    environments: {
      development: { url: "https://dev/" },
      production: { url: "https://prod/", restrictions: ["read-only"] },
    },
    defaultTarget: "development",
    auth: { method: "oauth", provider: "Okta" },
  }),
);

describe("resolveTarget", () => {
  const cap = (id: string) => CFG.capabilities.find((c) => c.id === id)!;

  it("prefers an explicit capability url (no restrictions)", () => {
    expect(resolveTarget(CFG, cap("REQ-EXPLICIT"), { defaultName: "local" })).toEqual({
      name: "local",
      url: "https://explicit/",
      restrictions: [],
    });
  });

  it("resolves a named environment with its restrictions", () => {
    expect(resolveTarget(CFG, cap("REQ-PROD"), { defaultName: "local" })).toEqual({
      name: "production",
      url: "https://prod/",
      restrictions: ["read-only"],
    });
  });

  it("falls back to the default target environment", () => {
    expect(resolveTarget(CFG, cap("REQ-DEFAULT"), { defaultName: "local" })).toEqual({
      name: "development",
      url: "https://dev/",
      restrictions: [],
    });
  });

  it("uses the caller fallback URL when no environment applies", () => {
    const bare = parseConfig(JSON.stringify({ capabilities: [{ id: "A", paths: ["x"] }] }));
    expect(resolveTarget(bare, bare.capabilities[0]!, { fallbackUrl: "https://cli/", defaultName: "local" })).toEqual({
      name: "local",
      url: "https://cli/",
      restrictions: [],
    });
    expect(resolveTarget(bare, bare.capabilities[0]!, { defaultName: "local" })).toBeUndefined();
  });
});

describe("authContext", () => {
  it("formats the auth block, or returns undefined when absent", () => {
    expect(authContext(CFG)).toBe("Authentication: oauth via Okta.");
    const noAuth = parseConfig(JSON.stringify({ capabilities: [{ id: "A", paths: ["x"] }] }));
    expect(authContext(noAuth)).toBeUndefined();
  });
});

const PERSONA_CFG = parseConfig(
  JSON.stringify({
    capabilities: [
      { id: "REQ-ADMIN", paths: ["x"], url: "http://x/", persona: "admin" },
      { id: "REQ-NONE", paths: ["y"], url: "http://y/" },
      { id: "REQ-BAD", paths: ["z"], url: "http://z/", persona: "ghost" },
    ],
    personas: [
      { name: "admin", testFocus: ["settings", "billing"], cannotDo: [] },
      { name: "viewer", testFocus: ["dashboards"], cannotDo: ["edit-settings", "manage-users"] },
    ],
  }),
);

describe("personaContext", () => {
  const cap = (id: string) => PERSONA_CFG.capabilities.find((c) => c.id === id)!;

  it("returns role context with focus and forbidden actions", () => {
    expect(personaContext(PERSONA_CFG, cap("REQ-ADMIN"))).toBe(
      "Act as the admin persona. Focus on: settings, billing.",
    );
    const viewerCfg = parseConfig(
      JSON.stringify({
        capabilities: [{ id: "V", paths: ["x"], url: "http://x/", persona: "viewer" }],
        personas: [{ name: "viewer", testFocus: ["dashboards"], cannotDo: ["edit-settings"] }],
      }),
    );
    expect(personaContext(viewerCfg, viewerCfg.capabilities[0]!)).toBe(
      "Act as the viewer persona. Focus on: dashboards. Do not: edit-settings.",
    );
  });

  it("returns undefined when the capability names no persona", () => {
    expect(personaContext(PERSONA_CFG, cap("REQ-NONE"))).toBeUndefined();
  });

  it("throws when the named persona is not defined", () => {
    expect(() => personaContext(PERSONA_CFG, cap("REQ-BAD"))).toThrow(/undefined persona 'ghost'/);
  });

  it("rejects a malformed persona block at parse time", () => {
    expect(() => parseConfig(JSON.stringify({ capabilities: [{ id: "A", paths: ["x"] }], personas: [{}] }))).toThrow(/name/);
    expect(() =>
      parseConfig(JSON.stringify({ capabilities: [{ id: "A", paths: ["x"] }], personas: [{ name: "p", testFocus: "x" }] })),
    ).toThrow(/testFocus/);
  });
});
