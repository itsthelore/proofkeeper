/**
 * A built-in {@link ModelClient} adapter for any OpenAI Chat-Completions–compatible
 * provider — the bring-your-own-model path for *any* model.
 *
 * Proofkeeper bundles no model (ADR-035, ADR-002). This adapter speaks the
 * OpenAI `/chat/completions` wire format, which is the de-facto standard shared
 * by OpenAI, OpenRouter, Together, Groq, Fireworks, DeepSeek, Mistral, vLLM, and
 * Ollama (`/v1`). Point `baseURL` at your provider, set `model`, and Proofkeeper
 * drives on it. It uses the platform `fetch` (Node >= 20) — NO extra dependency,
 * unlike the optional `@anthropic-ai/sdk` peer the Claude adapter needs.
 *
 * Defaults to OpenAI (`https://api.openai.com/v1`, `gpt-4o`). The translation
 * functions are pure and exported so the request/response mapping is unit-testable
 * without the network.
 */

import type { ModelClient, ModelRequest, ModelResponse, ToolCall } from "../model.js";

/** The model used unless overridden. */
export const DEFAULT_OPENAI_MODEL = "gpt-4o";

/** The endpoint base used unless overridden. */
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/** A chat message in the OpenAI request shape. */
interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A tool in the OpenAI function-calling shape. */
interface OpenAITool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Minimal structural shape of the OpenAI Chat Completions request we send. */
interface OpenAICreateParams {
  model: string;
  max_tokens: number;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  tool_choice?: "auto";
}

interface OpenAIToolCall {
  function?: { name?: string; arguments?: string };
}

interface OpenAIResponseMessage {
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAICompletion {
  choices?: { message?: OpenAIResponseMessage }[];
}

/** The slice of `fetch` this adapter calls. Inject a double for tests. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;

export interface OpenAICompatibleModelClientOptions {
  /** API key; falls back to the OPENAI_API_KEY environment variable. */
  apiKey?: string;
  /** Model id. Defaults to {@link DEFAULT_OPENAI_MODEL}. */
  model?: string;
  /** Endpoint base (no trailing `/chat/completions`). Defaults to {@link DEFAULT_OPENAI_BASE_URL}. */
  baseURL?: string;
  /** Output token cap per turn. Defaults to 4096 (tool decisions are small). */
  maxTokens?: number;
  /** Extra headers to send (e.g. an OpenRouter `HTTP-Referer`). */
  headers?: Record<string, string>;
  /** Inject a `fetch` implementation (or a test double); defaults to the global. */
  fetch?: FetchLike;
}

/**
 * Map the transcript to OpenAI messages. Unlike Anthropic, OpenAI keeps the
 * `system` turn(s) inside the messages array, so this is a near-identity map.
 */
export function toOpenAIMessages(transcript: ModelRequest["transcript"]): OpenAIMessage[] {
  return transcript.map((turn) => ({ role: turn.role, content: turn.content }));
}

/** Map Proofkeeper tool definitions to OpenAI function-tool definitions. */
export function toOpenAITools(tools: ModelRequest["tools"]): OpenAITool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

/** Parse an OpenAI tool-call arguments string (JSON), tolerating blank/invalid. */
function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Reduce an OpenAI completion to a {@link ModelResponse}. */
export function fromOpenAIResponse(completion: OpenAICompletion): ModelResponse {
  const message = completion.choices?.[0]?.message ?? {};
  const toolCalls: ToolCall[] = [];
  for (const call of message.tool_calls ?? []) {
    const name = call.function?.name;
    if (name) toolCalls.push({ name, arguments: parseToolArguments(call.function?.arguments) });
  }
  if (toolCalls.length > 0) return { toolCalls };
  return { done: message.content ?? "" };
}

export class OpenAICompatibleModelClient implements ModelClient {
  private readonly options: OpenAICompatibleModelClientOptions;

  constructor(options: OpenAICompatibleModelClientOptions = {}) {
    this.options = options;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const doFetch = this.options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
    if (!doFetch) {
      throw new Error(
        "OpenAICompatibleModelClient needs a `fetch` implementation. Use Node >= 18 (global fetch) or pass `fetch`.",
      );
    }

    const baseURL = (this.options.baseURL ?? DEFAULT_OPENAI_BASE_URL).replace(/\/$/, "");
    const apiKey = this.options.apiKey ?? process.env.OPENAI_API_KEY;

    const params: OpenAICreateParams = {
      model: this.options.model ?? DEFAULT_OPENAI_MODEL,
      max_tokens: this.options.maxTokens ?? 4096,
      messages: toOpenAIMessages(request.transcript),
      tools: toOpenAITools(request.tools),
      tool_choice: "auto",
    };

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...this.options.headers,
    };

    const res = await doFetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 500);
      throw new Error(`OpenAI-compatible request failed: ${res.status}${body ? ` — ${body}` : ""}`);
    }

    return fromOpenAIResponse((await res.json()) as OpenAICompletion);
  }
}
