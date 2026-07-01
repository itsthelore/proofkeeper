# Proofkeeper

<!--
Banner: add docs/assets/proofkeeper-header-{dark,light}.png, then uncomment.
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/itsthelore/proofkeeper/main/docs/assets/proofkeeper-header-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/itsthelore/proofkeeper/main/docs/assets/proofkeeper-header-light.png">
  <img alt="Proofkeeper — a bring-your-own-model agent that drives your app and leaves a re-runnable test as proof for each capability." src="https://raw.githubusercontent.com/itsthelore/proofkeeper/main/docs/assets/proofkeeper-header-light.png">
</picture>
-->

<p align="center">
<a href="#quickstart">Quickstart</a> ·
<a href="#how-it-compares">How it compares</a> ·
<a href="#how-it-works">How it works</a> ·
<a href="#bring-your-own-model">Bring your own model</a> ·
<a href="#origin">Origin</a> ·
<a href="./CHANGELOG.md">Changelog</a>
</p>

<p align="center">
<a href="https://github.com/itsthelore/proofkeeper/actions/workflows/ci.yml"><img src="https://github.com/itsthelore/proofkeeper/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
<a href="https://github.com/itsthelore/proofkeeper/actions/workflows/dogfood.yml"><img src="https://img.shields.io/github/actions/workflow/status/itsthelore/proofkeeper/dogfood.yml?branch=main&label=Dogfood&logo=githubactions&logoColor=white" alt="Dogfood: Proofkeeper verifies its own corpus"></a>
<a href="https://www.npmjs.com/package/@itsthelore/proofkeeper"><img src="https://img.shields.io/npm/v/@itsthelore/proofkeeper" alt="npm"></a>
<img src="https://img.shields.io/badge/node-%E2%89%A520-blue" alt="Node >= 20">
<img src="https://img.shields.io/badge/types-TypeScript-blue.svg" alt="TypeScript">
<a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache 2.0"></a>
</p>

> **rac-core captures what your product should do. Proofkeeper shows it does — a bring-your-own-model agent that drives your app and leaves a re-runnable test as proof for each capability.**

[Lore (rac-core)](https://github.com/itsthelore/rac-core) records what your product should do — requirements as code. Proofkeeper reads those capabilities over the published `rac export --graph` contract, drives your product to exercise each one, and compiles the run into a Playwright test it proposes back to the corpus by pull request. It produces verification evidence and nothing else — no code review, no codegen — and never touches the Lore engine's internals.

## How it compares

Proofkeeper turns an agent's exploratory run into a re-runnable test a human reviews: a committed Playwright test plus its trace, kept only after it clears a fidelity gate — not a recording to rewatch or a one-off review pass.

| | Proofkeeper | Record-and-replay | AI PR reviewer |
|---|---|---|---|
| Output | committed test + trace | annotated recording | comments on a diff |
| Re-runnable | yes (`npx playwright test`) | no | n/a |
| Flake handling | fidelity gate (N green re-runs) | none | n/a |
| Model | bring your own | bundled | bundled |

## Quickstart

1. **Install** the CLI and a browser:

   ```bash
   npm i -g @itsthelore/proofkeeper
   npx playwright install chromium
   ```

2. **See what's unverified** in a Lore corpus:

   ```bash
   proofkeeper coverage --corpus path/to/rac/
   ```

3. **Verify** a capability end to end:

   ```bash
   OPENAI_API_KEY=… proofkeeper qa --corpus path/to/rac/ --url http://localhost:3000/
   ```

Use `OPENAI_API_KEY` for any OpenAI-compatible provider, or `ANTHROPIC_API_KEY` for the built-in Claude adapter — see [Bring your own model](#bring-your-own-model).

## Install

| Command | Gets you |
|---|---|
| `npm i -g @itsthelore/proofkeeper` | the `proofkeeper` CLI and the library |
| `npx playwright install chromium` | the browser the drive and runner need |
| `npm i @anthropic-ai/sdk` | the optional Claude adapter (any other model needs nothing extra) |

Requires Node ≥ 20. No model ships with Proofkeeper — you bring the key.

## How it works

- **Drives** your product through a browser, a terminal, and HTTP — an agent loop on your model that clicks, types, and calls endpoints. It records only the actions that succeed.
- **Compiles** the run into a Playwright `.spec.ts` with a deterministic emitter, so record and replay agree byte-for-byte.
- **Fidelity-gates** each test by re-running it N times and keeping only the ones that stay green.
- **Runs** the kept tests and emits a replayable trace.
- **Proposes** the evidence back to Lore as a `## Verified By` link — by a pull request a human reviews, never a direct write.

It stays on the read side of Lore: it consumes `rac export --graph`, never the engine's internals, and bundles no model.

## Coverage

A requirement in the graph is a capability; it is verified when a `verified_by` edge links it to a test. `proofkeeper coverage` reports the gaps deterministically — no browser, no model:

```bash
proofkeeper coverage --graph-file graph.json       # from a graph export
proofkeeper coverage --corpus path/to/rac/ --json  # shell out to rac; machine-readable
```

Exit codes are a contract: `0` all verified, `1` something unverified (gates CI), `2` usage error. Proofkeeper targets graph `schema_version 1`; a different version is refused with a clear error.

## Verify a capability

```bash
OPENAI_API_KEY=… GITHUB_TOKEN=… proofkeeper qa \
  --corpus path/to/rac/ --url http://localhost:3000/ \
  --capability REQ-CHECKOUT --n 5 \
  --propose --repo itsthelore/your-corpus --target-path rac/requirements/checkout.md
```

`proofkeeper qa` (alias `verify`) runs the whole loop for one capability: pick → drive → compile → fidelity → run → optionally propose the write-back. With `--config` it scopes to a pull request, driving every capability the changed files touch — concurrently, context-isolated — and posting one comment that updates in place. `--plan` has the model write a test plan first.

## Bring your own model

No model is bundled. Two adapters cover most providers; the `ModelClient` interface covers the rest.

- **Any OpenAI-compatible provider** — any endpoint that speaks the chat-completions API with tool calls: OpenAI, OpenRouter, Together, Groq, DeepSeek, Mistral, and local Ollama / vLLM. Set `OPENAI_API_KEY`, plus `OPENAI_BASE_URL` / `OPENAI_MODEL` for non-OpenAI targets. No extra dependency; it uses the platform `fetch`.

  ```bash
  OPENAI_API_KEY=… OPENAI_BASE_URL=https://openrouter.ai/api/v1 OPENAI_MODEL=… \
    proofkeeper qa --corpus path/to/rac/ --url http://localhost:3000/
  ```

- **Claude** — set `ANTHROPIC_API_KEY`; the adapter lazily imports `@anthropic-ai/sdk`.
- **Anything else** — implement `ModelClient` (a single `complete()` method) and pass it to `runQa()` or `AutonomousDriver` from the library.

## Testing a browser extension

Point Proofkeeper at an unpacked extension and it drives the extension's own pages (`chrome-extension://…/popup.html`, options) and its effect on ordinary pages:

```bash
proofkeeper qa --corpus path/to/rac/ --url http://localhost:3000/ --extension ./my-extension
```

Or per environment in a config: `"environments": { "dev": { "url": "…", "extensionPath": "./my-extension" } }`.

Extensions load only in a persistent context, and an MV3 extension's ID changes on every load — so Proofkeeper loads it via Chromium's new headless, reads the ID from the extension's service worker, and emits a test that re-loads the extension and re-resolves the ID at run time. The committed test verifies the real extension, not a stale ID. MV3 Chromium, unpacked; packed `.crx` and other browsers are out of scope.

## Write-back

When a test is stable, Proofkeeper opens a pull request against the target's Lore corpus proposing a `## Verified By` link — the test path and its trace. It never commits the base branch, and GitHub access goes through an injected `RepoGateway`, so there's no hard dependency. The PR carries a numbered step summary and a `playwright show-trace` hint; once merged, the `verified_by` edge flips the capability to verified in `proofkeeper coverage`.

## Failure-learning

When a drive doesn't finish or a test fails the fidelity gate, the reason is recorded against the capability through a pluggable `LearningStore`, and the next drive is handed those reasons so it steers clear of the same dead ends. The `failureLearning` config controls how they surface — the default adds a "Known failure modes" section to the pull-request comment.

## Origin

Proofkeeper is a sibling of [Lore / RAC](https://github.com/itsthelore/rac-core), split out because verification is a runtime concern, not a knowledge one — the same split that moved [Wayfinder](https://github.com/itsthelore/wayfinder-router) (prompt-complexity routing) out of the engine. Lore records what a product should do; Proofkeeper drives it to prove it does. They compose over the published `rac export --graph` contract, so neither has to change for the other.

> **Naming.** The product is **Proofkeeper** (display brand **Lore Proofkeeper** where it helps). Unrelated to Epic Games' "Lore" version-control system.

## Repository layout

```text
proofkeeper/
  src/              coverage read-model, agent drive, session→test compiler,
                    fidelity gate, runner, and the write-back proposer
  src/cli.ts        the proofkeeper CLI (coverage, init, qa / verify)
  lore-proofkeeper/ the dogfood corpus that governs Proofkeeper itself
  tests/            vitest unit tests plus browser-gated e2e (PROOFKEEPER_E2E)
  examples/         the demo corpus, product page, and generated specs
```

## Test

```bash
npm run typecheck   # strict TypeScript
npm test            # vitest unit tests (fast, no browser)
npm run build       # emit dist/

# Browser-driven e2e (real Chromium), opt-in:
npx playwright install chromium
PROOFKEEPER_E2E=1 npx vitest run tests/runner.integration.test.ts
```

`npm test` is hermetic; the e2e tests run only under `PROOFKEEPER_E2E` (and in the CI `e2e` job).

## Project status

Published on npm and dated with CalVer (`YYYY.MM.N`). The full drive → compile → fidelity → run → write-back loop works against a real corpus, and Proofkeeper verifies its own capabilities in CI (the Dogfood badge above). Early and moving quickly — contributions and experiments welcome, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[Apache-2.0](./LICENSE). Contributions require a DCO sign-off — see [CONTRIBUTING.md](./CONTRIBUTING.md).
