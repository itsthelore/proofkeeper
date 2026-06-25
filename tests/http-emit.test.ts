import { describe, expect, it } from "vitest";

import type { RecordedSession } from "../src/compiler/actions.js";
import { emitSpec } from "../src/compiler/emit.js";

const session: RecordedSession = {
  capabilityId: "REQ-API",
  title: "api returns the order",
  startUrl: "about:blank",
  actions: [
    { type: "goto", url: "about:blank" },
    { type: "request", method: "GET", url: "http://localhost:3000/api/order/7" },
    { type: "expectStatus", status: 200 },
    { type: "expectJson", path: "data.id", equals: 7 },
    { type: "request", method: "POST", url: "http://localhost:3000/api/x", headers: { "content-type": "application/json" }, body: "{}" },
    { type: "expectJson", path: "ok", equals: true },
  ],
};

describe("emitSpec — HTTP actions", () => {
  it("inlines the httpRequest and jsonPath helpers and a httpRes holder", () => {
    const src = emitSpec(session);
    expect(src).toContain("async function httpRequest(input)");
    expect(src).toContain("function jsonPath(obj, path)");
    expect(src).toContain("let httpRes: { status: number; body: string };");
    // No terminal helper for an HTTP-only (plus browser) session.
    expect(src).not.toContain("node:child_process");
  });

  it("emits request with and without headers/body", () => {
    const src = emitSpec(session);
    expect(src).toContain("httpRes = await httpRequest({ method: 'GET', url: 'http://localhost:3000/api/order/7' });");
    expect(src).toContain(
      "httpRes = await httpRequest({ method: 'POST', url: 'http://localhost:3000/api/x', headers: { 'content-type': 'application/json' }, body: '{}' });",
    );
  });

  it("emits status and json-path assertions with correct literal types", () => {
    const src = emitSpec(session);
    expect(src).toContain("expect(httpRes.status).toBe(200);");
    expect(src).toContain("expect(jsonPath(JSON.parse(httpRes.body), 'data.id')).toBe(7);");
    expect(src).toContain("expect(jsonPath(JSON.parse(httpRes.body), 'ok')).toBe(true);");
  });

  it("does not inline the HTTP helpers for a browser-only session", () => {
    const browserOnly: RecordedSession = {
      title: "browser",
      startUrl: "http://x/",
      actions: [{ type: "goto", url: "http://x/" }, { type: "click", locator: { kind: "testId", testId: "go" } }],
    };
    expect(emitSpec(browserOnly)).not.toContain("httpRequest");
  });

  it("is deterministic for HTTP sessions", () => {
    expect(emitSpec(session)).toBe(emitSpec(session));
  });
});
