---
schema_version: 1
id: PK-KWBG608M2SVW
type: design
---
# OpenAI-Compatible Model Adapter

## Context

Proofkeeper drives products through the provider-agnostic `ModelClient` boundary and bundles no model (ADR-035, ADR-002). The only reference adapter is the Anthropic Claude one, and the CLI resolves a model solely from `ANTHROPIC_API_KEY`. This design adds a second built-in adapter and the CLI wiring to make bring-your-own-model real for any model, not just from library code.

## User Need

A user who runs `proofkeeper qa` with a non-Anthropic model — OpenAI, OpenRouter, Groq, a local Ollama or vLLM — needs to point Proofkeeper at their provider from the CLI with an env var, and have the drive loop work, without writing code against the library.

## Design

- A new adapter `OpenAICompatibleModelClient` (`src/agent/adapters/openai.ts`) implements `ModelClient` against the OpenAI `/chat/completions` wire format — the de-facto standard shared by OpenAI, OpenRouter, Together, Groq, Fireworks, DeepSeek, Mistral, vLLM, and Ollama (`/v1`).
- Options `{ apiKey?, model?, baseURL?, maxTokens?, headers?, fetch? }`. Defaults: base URL `https://api.openai.com/v1`, model `gpt-4o`, max tokens 4096. `baseURL`/`model` make one adapter target any compatible provider.
- Pure, exported mapping functions mirror the Claude adapter so they unit-test without network or SDK: `toOpenAIMessages` (system stays inline in the messages array, unlike Anthropic's hoisted system), `toOpenAITools` (function-tool wrapper), and `fromOpenAIResponse` (reads `choices[0].message`, maps `tool_calls` with JSON-string arguments parsed and tolerant of missing/blank/malformed, else returns the text as `done`).
- `complete()` POSTs `{ model, max_tokens, messages, tools, tool_choice: "auto" }` with a Bearer key via the platform `fetch` (injectable for tests), and throws a clear error with status and body on a non-2xx response.
- The CLI's `resolveModel` selects the adapter from the environment: `ANTHROPIC_API_KEY` first (backward compatible), else `OPENAI_API_KEY` with optional `OPENAI_BASE_URL` / `OPENAI_MODEL`, else a `UsageError` naming every option. The adapter and its symbols are exported from the package index; the README documents the env vars.

## Constraints

- No new runtime dependency: the adapter uses the platform `fetch` (Node >= 20), so installing Proofkeeper still pulls in no model for the OpenAI path.
- Provider-uniform: depend only on the broadly shared `/chat/completions` tool-calling contract; tolerate response-shape slack (blank/absent/invalid tool arguments default to `{}`).
- Backward compatible model selection: an existing `ANTHROPIC_API_KEY` setup is unaffected.

## Rationale

One adapter on the OpenAI format covers nearly every hosted and local provider, so a single, dependency-free addition delivers "any model" rather than one-provider-at-a-time SDK wrappers. Mirroring the Claude adapter's pure-function structure keeps the mapping testable and the two adapters consistent.

## Alternatives

- **Per-provider SDK adapters.** Rejected: each adds a dependency and only covers one backend, while they nearly all already speak the OpenAI format.
- **An `openai` SDK peer dependency (like `@anthropic-ai/sdk`).** Rejected: a raw `fetch` call to a documented, stable endpoint needs no dependency and avoids SDK base-URL quirks across non-OpenAI providers.
- **A `--model` / `--base-url` CLI flag instead of env vars.** Deferred: env selection matches the existing `ANTHROPIC_API_KEY` pattern and threads through both the `qa` and scoped commands with no parser changes.

## Accessibility

Not applicable — a model adapter and CLI selection; output is plain CLI text and error strings.

## Style Guidance

Mirror the Claude adapter (`src/agent/adapters/claude.ts`): exported pure mapping functions, an injectable client/fetch for tests, an options object with sensible defaults, and actionable error messages that name the remedy.

## Open Questions

- Whether to add explicit `--model` / `--base-url` flags once a second model-selection need appears. Deferred.

## Related Requirements

- req-openai-adapter

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
