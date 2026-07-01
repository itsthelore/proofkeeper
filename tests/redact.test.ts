/**
 * Observation redaction: the transcript ships to a third-party model provider,
 * so token-shaped values and query strings must be scrubbed from the side
 * channels before they enter it.
 */

import { describe, it, expect } from "vitest";

import { redactUrl, redactText } from "../src/agent/redact.js";

describe("redactUrl", () => {
  it("strips the query string and fragment, leaving a marker", () => {
    expect(redactUrl("https://api.example.com/v1/orders?token=s3cr3t&x=1#frag")).toBe(
      "https://api.example.com/v1/orders?…",
    );
  });

  it("leaves a query-less URL unchanged", () => {
    expect(redactUrl("https://api.example.com/v1/orders")).toBe("https://api.example.com/v1/orders");
  });

  it("returns non-URLs unchanged", () => {
    expect(redactUrl("not a url")).toBe("not a url");
  });
});

describe("redactText", () => {
  it("masks sensitive query parameters embedded in text", () => {
    expect(redactText("GET /cb?access_token=abc.def.ghi&state=ok")).toBe(
      "GET /cb?access_token=[redacted]&state=ok",
    );
  });

  it("masks bearer credentials", () => {
    expect(redactText("authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")).toBe(
      "authorization: Bearer [redacted]",
    );
  });

  it("masks provider-shaped keys in command output", () => {
    expect(redactText("OPENAI_API_KEY=sk-abc123def456ghi789")).toBe("OPENAI_API_KEY=[redacted]");
    expect(redactText("token ghp_abcdefghijklmnop1234")).toBe("token [redacted]");
  });

  it("leaves ordinary product text alone", () => {
    const text = "Order #1042 confirmed — total $18.50. Keyboard shortcuts: press k.";
    expect(redactText(text)).toBe(text);
  });
});
