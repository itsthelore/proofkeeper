---
schema_version: 1
id: PK-KWBG5ZMW29GJ
type: requirement
---
# OpenAI-Compatible Model Adapter

## Problem

Proofkeeper is bring-your-own-model by design (ADR-035, ADR-002): the drive loop runs against the provider-agnostic `ModelClient` boundary and bundles no model. But only one reference adapter ships — the Claude adapter — and the CLI's model resolution only recognises `ANTHROPIC_API_KEY`. In practice that makes the CLI Anthropic-only; using any other model requires writing code against the library. "Bring your own model" should mean any model, from the CLI.

## Requirements

- [REQ-001] Proofkeeper provides a built-in model adapter that speaks the OpenAI Chat-Completions wire format, so it drives any OpenAI-compatible provider (OpenAI, OpenRouter, Together, Groq, vLLM, Ollama, and the like).
- [REQ-002] The adapter's endpoint, model, and key are configurable, so a single adapter targets any compatible provider rather than OpenAI alone.
- [REQ-003] The CLI selects the OpenAI-compatible adapter from the environment (`OPENAI_API_KEY`, with optional `OPENAI_BASE_URL` and `OPENAI_MODEL`), without requiring library code.
- [REQ-004] Selecting a model stays backward compatible: an existing `ANTHROPIC_API_KEY` setup keeps using the Claude adapter, and a clear error names every option when no model is configured.
- [REQ-005] The adapter adds no new runtime dependency and pulls in no model, preserving the no-model-bundled guarantee.
- [REQ-006] The bring-your-own-model options are documented in the README so users know any model is first-class.

## Success Metrics

- A capability is driven end-to-end through an OpenAI-compatible provider using only `OPENAI_API_KEY` (and, for non-OpenAI targets, `OPENAI_BASE_URL` / `OPENAI_MODEL`), with no code changes.
- The request/response mapping (transcript, tools, tool calls) is covered by unit tests that need neither the network nor an SDK.
- Installing Proofkeeper still pulls in no model SDK for the OpenAI path.

## Risks

- Provider drift from the OpenAI format (subtle differences in tool-call shapes) could break a specific backend. Mitigation: depend only on the widely shared `/chat/completions` tool-calling contract and tolerate missing, blank, or malformed tool arguments rather than failing the drive.
- A model env set for one provider while another is intended could surprise the user. Mitigation: a documented, deterministic precedence and an error that names every option.

## Assumptions

- Target providers implement the OpenAI `/chat/completions` endpoint with function/tool calling, returning tool-call arguments as a JSON string.
- The platform `fetch` is available (Node >= 20), so the adapter needs no HTTP dependency.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `tests/openai-adapter.test.ts`
