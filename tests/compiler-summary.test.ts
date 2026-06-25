import { describe, expect, it } from "vitest";

import type { RecordedSession } from "../src/compiler/actions.js";
import { summarizeSession } from "../src/compiler/summary.js";

const session: RecordedSession = {
  title: "mixed flow",
  startUrl: "http://localhost:3000/",
  actions: [
    { type: "goto", url: "http://localhost:3000/" },
    { type: "fill", locator: { kind: "label", label: "Email" }, value: "a@b.com" },
    { type: "click", locator: { kind: "role", role: "button", name: "Verify" } },
    { type: "expectText", locator: { kind: "testId", testId: "status" }, text: "verified" },
    { type: "expectVisible", locator: { kind: "css", selector: ".ok" } },
    { type: "run", command: "npm test" },
    { type: "expectOutput", match: "contains", stream: "stdout", value: "passing" },
    { type: "expectExit", code: 0 },
  ],
};

describe("summarizeSession", () => {
  it("renders one readable line per action, in order", () => {
    expect(summarizeSession(session)).toEqual([
      "Navigate to http://localhost:3000/",
      'Fill the "Email" field with "a@b.com"',
      'Click the button "Verify"',
      'Expect [status] to read "verified"',
      "Expect `.ok` to be visible",
      "Run `npm test`",
      'Expect the last command\'s stdout to contains "passing"',
      "Expect the last command to exit 0",
    ]);
  });

  it("handles a role locator without a name", () => {
    expect(
      summarizeSession({
        title: "t",
        startUrl: "http://x/",
        actions: [{ type: "click", locator: { kind: "role", role: "heading" } }],
      }),
    ).toEqual(["Click the heading"]);
  });
});
