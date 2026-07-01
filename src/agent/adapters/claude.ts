/**
 * A reference {@link ModelClient} adapter for the Anthropic Claude API.
 *
 * Proofkeeper bundles no model (ADR-035, ADR-002) — this adapter is OPTIONAL
 * and sits behind the `ModelClient` boundary. `@anthropic-ai/sdk` is an
 * optional peer dependency, imported lazily, so installing Proofkeeper does not
 * pull in a model SDK. Bring your own provider by implementing `ModelClient`
 * directly; this adapter is one worked example, not a requirement.
 *
 * Defaults to `claude-opus-4-8`. The translation functions are pure and
 * exported so the request/response mapping is unit-testable without the SDK or
 * the network.
 */

import type { ModelClient, ModelRequest, ModelResponse, ToolCall } from "../model.js";

/** The model used unless overridden. */
export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";

/** Minimal structural shape of the Anthropic Messages API we depend on. */
interface AnthropicCreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tools?: { name: string; description: string; input_schema: Record<string, unknown> }[];
  thinking?: { type: "adaptive" };
  output_config?: { effort: string };
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicMessage {
  stop_reason?: string;
  content: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** The slice of the Anthropic SDK client this adapter calls. */
export interface AnthropicLike {
  messages: { create(params: AnthropicCreateParams): Promise<AnthropicMessage> };
}

export interface ClaudeModelClientOptions {
  /** API key; falls back to the ANTHROPIC_API_KEY environment variable. */
  apiKey?: string;
  /** Model id. Defaults to {@link DEFAULT_CLAUDE_MODEL}. */
  model?: string;
  /** Output token cap per turn. Defaults to 4096 (tool decisions are small). */
  maxTokens?: number;
  /** Enable adaptive thinking. Off by default to keep the text transcript self-contained. */
  thinking?: boolean;
  /** Optional effort level (low | medium | high | xhigh | max). */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Inject a pre-constructed client (or a test double); skips the SDK import. */
  client?: AnthropicLike;
}

/** Split the transcript into the Anthropic `system` string and message turns. */
export function toAnthropicMessages(transcript: ModelRequest["transcript"]): {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
} {
  const systemParts: string[] = [];
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of transcript) {
    if (turn.role === "system") {
      systemParts.push(turn.content);
    } else {
      messages.push({ role: turn.role, content: turn.content });
    }
  }
  const system = systemParts.length > 0 ? systemParts.join("\n\n") : undefined;
  return system === undefined ? { messages } : { system, messages };
}

/** Map Proofkeeper tool definitions to Anthropic tool definitions. */
export function toAnthropicTools(
  tools: ModelRequest["tools"],
): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema ?? { type: "object", properties: {} },
  }));
}

/** Reduce an Anthropic response to a {@link ModelResponse}. */
export function fromAnthropicResponse(message: AnthropicMessage): ModelResponse {
  const toolCalls: ToolCall[] = [];
  const textParts: string[] = [];
  for (const block of message.content) {
    if (block.type === "tool_use" && block.name) {
      toolCalls.push({ name: block.name, arguments: block.input ?? {} });
    } else if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
  }
  const usage =
    message.usage !== undefined
      ? { usage: { inputTokens: message.usage.input_tokens ?? 0, outputTokens: message.usage.output_tokens ?? 0 } }
      : {};
  if (toolCalls.length > 0) return { toolCalls, ...usage };
  return { done: textParts.join("\n"), ...usage };
}

export class ClaudeModelClient implements ModelClient {
  private readonly options: ClaudeModelClientOptions;
  private client: AnthropicLike | undefined;

  constructor(options: ClaudeModelClientOptions = {}) {
    this.options = options;
    this.client = options.client;
  }

  /** Lazily construct the SDK client, importing the optional peer dependency. */
  private async getClient(): Promise<AnthropicLike> {
    if (this.client) return this.client;
    let mod: { default: new (opts: { apiKey?: string }) => AnthropicLike };
    try {
      mod = (await import("@anthropic-ai/sdk")) as unknown as typeof mod;
    } catch {
      throw new Error(
        "ClaudeModelClient needs the optional peer dependency '@anthropic-ai/sdk'. " +
          "Install it (`npm install @anthropic-ai/sdk`) or pass your own `client`.",
      );
    }
    const Anthropic = mod.default;
    this.client = new Anthropic({ apiKey: this.options.apiKey });
    return this.client;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const client = await this.getClient();
    const { system, messages } = toAnthropicMessages(request.transcript);

    const params: AnthropicCreateParams = {
      model: this.options.model ?? DEFAULT_CLAUDE_MODEL,
      max_tokens: this.options.maxTokens ?? 4096,
      messages,
      tools: toAnthropicTools(request.tools),
    };
    if (system !== undefined) params.system = system;
    if (this.options.thinking) params.thinking = { type: "adaptive" };
    if (this.options.effort) params.output_config = { effort: this.options.effort };

    return fromAnthropicResponse(await client.messages.create(params));
  }
}
