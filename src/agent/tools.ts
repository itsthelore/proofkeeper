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
    name: "run_command",
    description: "Run a shell command in the product's terminal. Its result is recorded for assertions.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run" },
        cwd: { type: "string", description: "Working directory (optional)" },
      },
      required: ["command"],
    },
  },
  {
    name: "expect_output",
    description: "Assert the last command's stdout/stderr — record an observable outcome.",
    inputSchema: {
      type: "object",
      properties: {
        match: { type: "string", enum: ["exact", "contains", "regex"] },
        stream: { type: "string", enum: ["stdout", "stderr"] },
        value: { type: "string", description: "Expected value (exact text, substring, or regex source)" },
      },
      required: ["match", "stream", "value"],
    },
  },
  {
    name: "expect_exit",
    description: "Assert the last command's exit code.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "number", description: "Expected exit code, e.g. 0" } },
      required: ["code"],
    },
  },
  {
    name: "request",
    description: "Issue an HTTP request to an absolute URL. Its response is recorded for assertions.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", description: "HTTP method, e.g. GET or POST" },
        url: { type: "string", description: "Absolute URL to request" },
        headers: { type: "object", description: "Optional request headers" },
        body: { type: "string", description: "Optional request body" },
      },
      required: ["method", "url"],
    },
  },
  {
    name: "expect_status",
    description: "Assert the last response's HTTP status code.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "number", description: "Expected status, e.g. 200" } },
      required: ["status"],
    },
  },
  {
    name: "expect_json",
    description: "Assert a field of the last response's JSON body equals a value.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Dot-path into the JSON body, e.g. data.order.id" },
        equals: { type: ["string", "number", "boolean"], description: "Expected scalar value" },
      },
      required: ["path", "equals"],
    },
  },
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

/** Guidance for the terminal tools, folded into the system prompt. */
export const TERMINAL_GUIDANCE =
  "You also have a terminal. run_command runs a shell command and records its result; " +
  "expect_output asserts the last command's stdout or stderr (match: exact|contains|regex), " +
  "and expect_exit asserts its exit code. Run a command, read its result, then assert the " +
  "outcomes you observe — those assertions become the committed test.";

/** Guidance for the HTTP tools, folded into the system prompt. */
export const HTTP_GUIDANCE =
  "You also have HTTP tools for API capabilities. request issues an HTTP request to an " +
  "absolute URL and records the response; expect_status asserts the response status code, " +
  "and expect_json asserts a dot-path field of a JSON response body equals a value. Issue a " +
  "request, read the response, then assert the outcomes — those become the committed test.";

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

/** Arguments for the `run_command` tool. */
export interface RunCommandArgs {
  command: string;
  cwd?: string;
}

/** Parse a `run_command` tool call's arguments. */
export function parseRunCommand(args: Record<string, unknown>): RunCommandArgs {
  const command = str(args["command"], "command");
  const cwd = args["cwd"];
  return cwd === undefined || cwd === null ? { command } : { command, cwd: str(cwd, "cwd") };
}

/** Arguments for the `expect_output` tool. */
export interface OutputAssertionArgs {
  match: "exact" | "contains" | "regex";
  stream: "stdout" | "stderr";
  value: string;
}

/** Parse an `expect_output` tool call's arguments. */
export function parseExpectOutput(args: Record<string, unknown>): OutputAssertionArgs {
  const match = str(args["match"], "match");
  if (match !== "exact" && match !== "contains" && match !== "regex") {
    throw new ToolArgumentError(`unknown match mode: ${JSON.stringify(match)}`);
  }
  const stream = str(args["stream"], "stream");
  if (stream !== "stdout" && stream !== "stderr") {
    throw new ToolArgumentError(`unknown stream: ${JSON.stringify(stream)}`);
  }
  return { match, stream, value: str(args["value"], "value") };
}

/** Parse an `expect_exit` tool call's arguments. */
export function parseExpectExit(args: Record<string, unknown>): number {
  const code = args["code"];
  if (typeof code !== "number" || !Number.isInteger(code)) {
    throw new ToolArgumentError(`expected an integer exit code, got ${JSON.stringify(code)}`);
  }
  return code;
}

/** Arguments for the `request` tool. */
export interface RequestArgs {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Parse a `request` tool call's arguments. */
export function parseRequest(args: Record<string, unknown>): RequestArgs {
  const out: RequestArgs = { method: str(args["method"], "method"), url: str(args["url"], "url") };
  const headers = args["headers"];
  if (headers !== undefined && headers !== null) {
    if (typeof headers !== "object" || Array.isArray(headers)) {
      throw new ToolArgumentError("headers must be an object of strings");
    }
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      record[key] = str(value, `headers.${key}`);
    }
    out.headers = record;
  }
  const body = args["body"];
  if (body !== undefined && body !== null) out.body = str(body, "body");
  return out;
}

/** Parse an `expect_status` tool call's arguments. */
export function parseExpectStatus(args: Record<string, unknown>): number {
  const status = args["status"];
  if (typeof status !== "number" || !Number.isInteger(status)) {
    throw new ToolArgumentError(`expected an integer status, got ${JSON.stringify(status)}`);
  }
  return status;
}

/** Arguments for the `expect_json` tool. */
export interface ExpectJsonArgs {
  path: string;
  equals: string | number | boolean;
}

/** Parse an `expect_json` tool call's arguments. */
export function parseExpectJson(args: Record<string, unknown>): ExpectJsonArgs {
  const path = str(args["path"], "path");
  const equals = args["equals"];
  if (typeof equals !== "string" && typeof equals !== "number" && typeof equals !== "boolean") {
    throw new ToolArgumentError("expect_json equals must be a string, number, or boolean");
  }
  return { path, equals };
}
