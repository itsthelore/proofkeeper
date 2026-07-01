import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  OpenAICompatibleModelClient,
  fromOpenAIResponse,
  toOpenAIMessages,
  toOpenAITools,
  type FetchLike,
} from "../src/agent/adapters/openai.js";
import { DRIVE_TOOLS } from "../src/agent/tools.js";
import type { ModelRequest } from "../src/agent/model.js";

describe("toOpenAIMessages", () => {
  it("keeps system turns in the messages array and preserves order", () => {
    const messages = toOpenAIMessages([
      { role: "system", content: "You are a QA agent." },
      { role: "user", content: "start page" },
      { role: "assistant", content: "[tool calls]" },
      { role: "user", content: "results" },
    ]);
    expect(messages).toEqual([
      { role: "system", content: "You are a QA agent." },
      { role: "user", content: "start page" },
      { role: "assistant", content: "[tool calls]" },
      { role: "user", content: "results" },
    ]);
  });
});

describe("toOpenAITools", () => {
  it("wraps tools as function tools and carries the drive tool schemas", () => {
    const tools = toOpenAITools([...DRIVE_TOOLS]);
    const navigate = tools.find((t) => t.function.name === "navigate");
    expect(navigate?.type).toBe("function");
    expect(navigate?.function.parameters).toMatchObject({ type: "object", required: ["url"] });
    const click = tools.find((t) => t.function.name === "click");
    expect(click?.function.parameters).toMatchObject({ required: ["locator"] });
  });

  it("defaults the parameters when a tool has no schema", () => {
    expect(toOpenAITools([{ name: "x", description: "d" }])[0]?.function.parameters).toEqual({
      type: "object",
      properties: {},
    });
  });
});

describe("fromOpenAIResponse", () => {
  it("parses the JSON-string tool_call arguments (ignoring narration content)", () => {
    const result = fromOpenAIResponse({
      choices: [
        {
          message: {
            content: "I'll click Verify.",
            tool_calls: [
              { function: { name: "click", arguments: '{"locator":{"strategy":"role","role":"button"}}' } },
            ],
          },
        },
      ],
    });
    expect(result.toolCalls).toEqual([
      { name: "click", arguments: { locator: { strategy: "role", role: "button" } } },
    ]);
    expect(result.done).toBeUndefined();
  });

  it("returns done with the content when there are no tool calls", () => {
    const result = fromOpenAIResponse({ choices: [{ message: { content: "All set." } }] });
    expect(result.done).toBe("All set.");
    expect(result.toolCalls).toBeUndefined();
  });

  it("defaults missing, blank, or malformed tool arguments to an empty object", () => {
    expect(
      fromOpenAIResponse({
        choices: [{ message: { tool_calls: [{ function: { name: "finish" } }] } }],
      }).toolCalls,
    ).toEqual([{ name: "finish", arguments: {} }]);

    expect(
      fromOpenAIResponse({
        choices: [{ message: { tool_calls: [{ function: { name: "finish", arguments: "" } }] } }],
      }).toolCalls,
    ).toEqual([{ name: "finish", arguments: {} }]);

    expect(
      fromOpenAIResponse({
        choices: [{ message: { tool_calls: [{ function: { name: "finish", arguments: "not json" } }] } }],
      }).toolCalls,
    ).toEqual([{ name: "finish", arguments: {} }]);
  });

  it("surfaces provider-reported usage on both tool-call and done turns", () => {
    const withTools = fromOpenAIResponse({
      choices: [{ message: { tool_calls: [{ function: { name: "finish", arguments: "{}" } }] } }],
      usage: { prompt_tokens: 120, completion_tokens: 15 },
    });
    expect(withTools.usage).toEqual({ inputTokens: 120, outputTokens: 15 });

    const doneTurn = fromOpenAIResponse({
      choices: [{ message: { content: "done" } }],
      usage: { prompt_tokens: 80, completion_tokens: 5 },
    });
    expect(doneTurn.usage).toEqual({ inputTokens: 80, outputTokens: 5 });

    const noUsage = fromOpenAIResponse({ choices: [{ message: { content: "done" } }] });
    expect(noUsage.usage).toBeUndefined();
  });

  it("returns an empty done when the provider sends no content and no tool calls", () => {
    expect(fromOpenAIResponse({ choices: [{ message: {} }] }).done).toBe("");
    expect(fromOpenAIResponse({}).done).toBe("");
  });
});

describe("OpenAICompatibleModelClient.complete", () => {
  const request: ModelRequest = {
    transcript: [
      { role: "system", content: "Drive the product." },
      { role: "user", content: "You are on the start page." },
    ],
    tools: [...DRIVE_TOOLS],
  };

  function okResponse(json: unknown): ReturnType<FetchLike> {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
      json: () => Promise.resolve(json),
    });
  }

  it("posts to {baseURL}/chat/completions with auth + mapped params and returns tool calls", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(() =>
      okResponse({
        choices: [{ message: { tool_calls: [{ function: { name: "finish", arguments: "{}" } }] } }],
      }),
    );

    const client = new OpenAICompatibleModelClient({
      apiKey: "sk-test",
      baseURL: "https://openrouter.ai/api/v1",
      model: "test-model",
      maxTokens: 256,
      fetch: fetchFn,
    });
    const result = await client.complete(request);

    expect(result.toolCalls).toEqual([{ name: "finish", arguments: {} }]);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer sk-test");
    expect(init.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("test-model");
    expect(body.max_tokens).toBe(256);
    expect(body.tool_choice).toBe("auto");
    expect(body.messages[0]).toEqual({ role: "system", content: "Drive the product." });
    expect(body.tools.find((t: { function: { name: string } }) => t.function.name === "click")).toBeTruthy();
  });

  it("defaults baseURL and model to OpenAI", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(() =>
      okResponse({ choices: [{ message: { content: "done" } }] }),
    );
    const client = new OpenAICompatibleModelClient({ apiKey: "sk-test", fetch: fetchFn });
    const result = await client.complete(request);

    expect(result.done).toBe("done");
    expect(DEFAULT_OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-4o");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).model).toBe("gpt-4o");
  });

  it("throws a clear error with status and body on a non-2xx response", async () => {
    const fetchFn: FetchLike = () =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve("invalid api key"),
        json: () => Promise.resolve({}),
      });
    const client = new OpenAICompatibleModelClient({ apiKey: "bad", fetch: fetchFn });
    await expect(client.complete(request)).rejects.toThrow(/401.*invalid api key/);
  });
});
