/**
 * The tool surface the autonomous drive exposes to the BYO model, and the
 * parsing of a model's tool-call arguments back into the typed IR.
 *
 * Each tool maps one-to-one onto a {@link Recorder} action, so the model drives
 * the product through exactly the vocabulary the compiler can emit — nothing
 * the recorder cannot capture, and nothing the emitter cannot render.
 */

import type { Locator } from "../compiler/actions.js";

/** A tool definition advertised to the model, carrying a JSON Schema for args. */
export interface DriveTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** JSON Schema for a {@link Locator} argument, shared across tools. */
const LOCATOR_SCHEMA: Record<string, unknown> = {
  type: "object",
  description: "How to find the element. Prefer role, testId, or text over css.",
  properties: {
    strategy: { type: "string", enum: ["role", "testId", "text", "label", "css"] },
    role: { type: "string", description: "ARIA role, e.g. 'button' (strategy=role)" },
    name: { type: "string", description: "Accessible name (strategy=role)" },
    testId: { type: "string", description: "data-testid value (strategy=testId)" },
    text: { type: "string", description: "Visible text (strategy=text)" },
    label: { type: "string", description: "Form label (strategy=label)" },
    selector: { type: "string", description: "CSS selector (strategy=css)" },
  },
  required: ["strategy"],
};

function withLocator(extra: Record<string, unknown> = {}, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    properties: { locator: LOCATOR_SCHEMA, ...extra },
    required: ["locator", ...required],
  };
}

/** The tools advertised to the model each turn. Names map to Recorder methods. */
export const DRIVE_TOOLS: readonly DriveTool[] = [
  {
    name: "navigate",
    description: "Go to a URL.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "Absolute URL to navigate to" } },
      required: ["url"],
    },
  },
  { name: "click", description: "Click an element.", inputSchema: withLocator() },
  {
    name: "fill",
    description: "Fill a text input.",
    inputSchema: withLocator({ value: { type: "string", description: "Text to type" } }, ["value"]),
  },
  { name: "check", description: "Check a checkbox or radio.", inputSchema: withLocator() },
  {
    name: "press",
    description: "Press a key on an element.",
    inputSchema: withLocator({ key: { type: "string", description: "Key name, e.g. 'Enter'" } }, ["key"]),
  },
  {
    name: "expect_text",
    description: "Assert an element has exactly this text — record an observable outcome.",
    inputSchema: withLocator({ text: { type: "string", description: "Expected exact text" } }, ["text"]),
  },
  { name: "expect_visible", description: "Assert an element is visible.", inputSchema: withLocator() },
  {
    name: "finish",
    description: "End the session: the capability has been driven and asserted.",
    inputSchema: { type: "object", properties: {} },
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
