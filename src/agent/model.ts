/**
 * The bring-your-own-model boundary — Proofkeeper Initiative 2.
 *
 * No model or inference ships with Proofkeeper (ADR-035, ADR-002): the agent
 * runtime lives here, but the *model* is supplied by the caller. This is the
 * minimal interface the drive loop needs. Adapters for specific providers live
 * outside core and are the caller's choice.
 */

/** A tool the agent may call while driving a product (browser/terminal action). */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** A single turn's request to the model: the running transcript plus tools. */
export interface ModelRequest {
  /** Prior transcript, oldest first. Free-form, provider-shaped by the adapter. */
  transcript: { role: "system" | "user" | "assistant"; content: string }[];
  /**
   * Tools the model may invoke this turn. `inputSchema` is a JSON Schema for
   * the tool's arguments; adapters forward it to providers that require one
   * (e.g. the Anthropic Messages API's `input_schema`).
   */
  tools: { name: string; description: string; inputSchema?: Record<string, unknown> }[];
}

/** The model's decision for a turn: either act (tool calls) or stop (text). */
export interface ModelResponse {
  /** Tool calls to execute, if any. */
  toolCalls?: ToolCall[];
  /** Terminal assistant message when the model decides the session is done. */
  done?: string;
}

/** A caller-supplied model. Proofkeeper bundles none. */
export interface ModelClient {
  complete(request: ModelRequest): Promise<ModelResponse>;
}
