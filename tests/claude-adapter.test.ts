import { describe, expect, it, vi } from "vitest";

import {
  ClaudeModelClient,
  DEFAULT_CLAUDE_MODEL,
  fromAnthropicResponse,
  toAnthropicMessages,
  toAnthropicTools,
  type AnthropicLike,
} from "../src/agent/adapters/claude.js";
import { DRIVE_TOOLS } from "../src/agent/tools.js";
import type { ModelRequest } from "../src/agent/model.js";

describe("toAnthropicMessages", () => {
  it("hoists system turns into the system string and keeps user/assistant order", () => {
    const { system, messages } = toAnthropicMessages([
      { role: "system", content: "You are a QA agent." },
      { role: "user", content: "start page" },
      { role: "assistant", content: "[tool calls]" },
      { role: "user", content: "results" },
    ]);
    expect(system).toBe("You are a QA agent.");
    expect(messages).toEqual([
      { role: "user", content: "start page" },
      { role: "assistant", content: "[tool calls]" },
      { role: "user", content: "results" },
    ]);
  });

  it("joins multiple system turns and omits system when there are none", () => {
    expect(toAnthropicMessages([{ role: "system", content: "a" }, { role: "system", content: "b" }]).system).toBe(
      "a\n\nb",
    );
    expect(toAnthropicMessages([{ role: "user", content: "hi" }]).system).toBeUndefined();
  });
});

describe("toAnthropicTools", () => {
  it("maps inputSchema to input_schema and carries the drive tool schemas", () => {
    const tools = toAnthropicTools([...DRIVE_TOOLS]);
    const navigate = tools.find((t) => t.name === "navigate");
    expect(navigate?.input_schema).toMatchObject({ type: "object", required: ["url"] });
    const click = tools.find((t) => t.name === "click");
    expect(click?.input_schema).toMatchObject({ required: ["locator"] });
  });

  it("defaults the schema when a tool has none", () => {
    expect(toAnthropicTools([{ name: "x", description: "d" }])[0]?.input_schema).toEqual({
      type: "object",
      properties: {},
    });
  });
});

describe("fromAnthropicResponse", () => {
  it("maps tool_use blocks to tool calls (ignoring narration text)", () => {
    const result = fromAnthropicResponse({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "I'll click Verify." },
        { type: "tool_use", name: "click", input: { locator: { strategy: "role", role: "button" } } },
      ],
    });
    expect(result.toolCalls).toEqual([
      { name: "click", arguments: { locator: { strategy: "role", role: "button" } } },
    ]);
    expect(result.done).toBeUndefined();
  });

  it("returns done with the text when there are no tool calls", () => {
    const result = fromAnthropicResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "All set." }] });
    expect(result.done).toBe("All set.");
    expect(result.toolCalls).toBeUndefined();
  });

  it("surfaces provider-reported usage on both tool-call and done turns", () => {
    const withTools = fromAnthropicResponse({
      content: [{ type: "tool_use", name: "finish", input: {} }],
      usage: { input_tokens: 120, output_tokens: 15 },
    });
    expect(withTools.usage).toEqual({ inputTokens: 120, outputTokens: 15 });

    const doneTurn = fromAnthropicResponse({
      content: [{ type: "text", text: "done" }],
      usage: { input_tokens: 80, output_tokens: 5 },
    });
    expect(doneTurn.usage).toEqual({ inputTokens: 80, outputTokens: 5 });

    const noUsage = fromAnthropicResponse({ content: [{ type: "text", text: "done" }] });
    expect(noUsage.usage).toBeUndefined();
  });

  it("defaults missing tool input to an empty object", () => {
    const result = fromAnthropicResponse({ content: [{ type: "tool_use", name: "finish" }] });
    expect(result.toolCalls).toEqual([{ name: "finish", arguments: {} }]);
  });
});

describe("ClaudeModelClient.complete", () => {
  const request: ModelRequest = {
    transcript: [
      { role: "system", content: "Drive the product." },
      { role: "user", content: "You are on the start page." },
    ],
    tools: [...DRIVE_TOOLS],
  };

  it("calls the injected client with the mapped params and returns mapped tool calls", async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", name: "finish", input: {} }],
    });
    const fake: AnthropicLike = { messages: { create } };

    const client = new ClaudeModelClient({ client: fake, model: "claude-test", maxTokens: 256, effort: "high" });
    const result = await client.complete(request);

    expect(result.toolCalls).toEqual([{ name: "finish", arguments: {} }]);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-test");
    expect(params.max_tokens).toBe(256);
    expect(params.system).toBe("Drive the product.");
    expect(params.output_config).toEqual({ effort: "high" });
    expect(params.tools.find((t: { name: string }) => t.name === "click")).toBeTruthy();
    expect(params.thinking).toBeUndefined(); // off by default
  });

  it("defaults to claude-opus-4-8 and enables adaptive thinking when requested", async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "done" }] });
    const client = new ClaudeModelClient({ client: { messages: { create } }, thinking: true });
    const result = await client.complete(request);

    expect(result.done).toBe("done");
    expect(DEFAULT_CLAUDE_MODEL).toBe("claude-opus-4-8");
    expect(create.mock.calls[0][0].model).toBe("claude-opus-4-8");
    expect(create.mock.calls[0][0].thinking).toEqual({ type: "adaptive" });
  });
});
