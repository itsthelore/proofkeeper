import { describe, expect, it } from "vitest";

import { summarizeSession } from "../src/compiler/summary.js";
import type { RecordedSession } from "../src/compiler/actions.js";

const SESSION: RecordedSession = {
  capabilityId: "REQ-VERIFY",
  title: "verify flow",
  startUrl: "http://localhost:3000/",
  actions: [
    { type: "goto", url: "http://localhost:3000/" },
    { type: "expectText", locator: { kind: "testId", testId: "heading" }, text: "Lore Proofkeeper" },
    { type: "fill", locator: { kind: "label", label: "Email" }, value: "a@b.com" },
    { type: "click", locator: { kind: "role", role: "button", name: "Verify" } },
    { type: "press", locator: { kind: "css", selector: "#q" }, key: "Enter" },
    { type: "expectVisible", locator: { kind: "text", text: "Done" } },
  ],
};

describe("summarizeSession", () => {
  it("renders numbered, reviewer-facing lines for each action", () => {
    expect(summarizeSession(SESSION)).toEqual([
      "1. Navigate to http://localhost:3000/",
      '2. Expect [heading] to read "Lore Proofkeeper"',
      '3. Fill the "Email" field with "a@b.com"',
      '4. Click the button "Verify"',
      "5. Press Enter on `#q`",
      '6. Expect "Done" to be visible',
    ]);
  });

  it("returns an empty list for a session with no actions", () => {
    expect(summarizeSession({ ...SESSION, actions: [] })).toEqual([]);
  });
});
