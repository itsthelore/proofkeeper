/**
 * The tool surface the autonomous drive exposes to the BYO model, and the
 * parsing of a model's tool-call arguments back into the typed IR.
 *
 * Each tool maps one-to-one onto a {@link Recorder} action, so the model drives
 * the product through exactly the vocabulary the compiler can emit — nothing
 * the recorder cannot capture, and nothing the emitter cannot render.
 */

import type { Locator } from "../compiler/actions.js";

/** The tools advertised to the model each turn. Names map to Recorder methods. */
export const DRIVE_TOOLS: readonly { name: string; description: string }[] = [
  { name: "navigate", description: "Go to a URL. args: { url: string }" },
  {
    name: "click",
    description: "Click an element. args: { locator }",
  },
  {
    name: "fill",
    description: "Fill a text input. args: { locator, value: string }",
  },
  { name: "check", description: "Check a checkbox or radio. args: { locator }" },
  {
    name: "press",
    description: "Press a key on an element. args: { locator, key: string }",
  },
  {
    name: "expect_text",
    description:
      "Assert an element has exactly this text — record an observable outcome. args: { locator, text: string }",
  },
  {
    name: "expect_visible",
    description: "Assert an element is visible. args: { locator }",
  },
  {
    name: "finish",
    description: "End the session: the capability has been driven and asserted. args: {}",
  },
];

/**
 * A locator is `{ strategy, ... }`. Prefer resilient strategies (role with a
 * name, testId, or text) over css. This text is folded into the system prompt.
 */
export const LOCATOR_GUIDANCE =
  "A locator is an object { strategy: 'role'|'testId'|'text'|'label'|'css', ... }: " +
  "role needs { role, name? }, testId needs { testId }, text needs { text }, " +
  "label needs { label }, css needs { selector }. Prefer role, testId, or text over css. " +
  "A locator may be passed as the `locator` field or inline on the arguments.";

/** Raised when a model's locator arguments are not a recognizable strategy. */
export class ToolArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolArgumentError";
  }
}

function str(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ToolArgumentError(`expected string for '${field}', got ${typeof value}`);
  }
  return value;
}

/**
 * Parse a model tool-call's arguments into a {@link Locator}.
 *
 * Accepts the locator nested under `locator` or inline on the arguments object.
 *
 * @throws {ToolArgumentError} on a missing or unrecognized strategy.
 */
export function parseLocator(args: Record<string, unknown>): Locator {
  const raw = (args["locator"] ?? args) as Record<string, unknown>;
  const strategy = raw["strategy"];
  switch (strategy) {
    case "role": {
      const name = raw["name"];
      return name === undefined || name === null
        ? { kind: "role", role: str(raw["role"], "role") }
        : { kind: "role", role: str(raw["role"], "role"), name: str(name, "name") };
    }
    case "testId":
      return { kind: "testId", testId: str(raw["testId"], "testId") };
    case "text":
      return { kind: "text", text: str(raw["text"], "text") };
    case "label":
      return { kind: "label", label: str(raw["label"], "label") };
    case "css":
      return { kind: "css", selector: str(raw["selector"], "selector") };
    default:
      throw new ToolArgumentError(`unknown locator strategy: ${JSON.stringify(strategy)}`);
  }
}
