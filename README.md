# Proofkeeper

<!--
Banner: add docs/assets/proofkeeper-header-{dark,light}.png, then uncomment.
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/itsthelore/lore-proofkeeper/main/docs/assets/proofkeeper-header-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/itsthelore/lore-proofkeeper/main/docs/assets/proofkeeper-header-light.png">
  <img alt="Proofkeeper — the verification arm of Lore. A BYOK agent that drives your app and proves every capability with a real test." src="https://raw.githubusercontent.com/itsthelore/lore-proofkeeper/main/docs/assets/proofkeeper-header-light.png">
</picture>
-->

<p align="center">
<a href="#quickstart">Quickstart</a> ·
<a href="#how-it-compares">How it compares</a> ·
<a href="#how-it-works">How it works</a> ·
<a href="#write-back">Write-back</a> ·
<a href="#origin">Origin</a>
</p>

<p align="center">
<a href="https://github.com/itsthelore/lore-proofkeeper/actions/workflows/ci.yml"><img src="https://github.com/itsthelore/lore-proofkeeper/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
<a href="https://www.npmjs.com/package/@itsthelore/proofkeeper"><img src="https://img.shields.io/npm/v/@itsthelore/proofkeeper" alt="npm"></a>
<img src="https://img.shields.io/badge/node-%E2%89%A520-blue" alt="Node >= 20">
<img src="https://img.shields.io/badge/types-TypeScript-blue.svg" alt="TypeScript">
<a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache 2.0"></a>
</p>

> **rac-core captures what your product should do. Proofkeeper proves it does — a BYOK agent that drives your app and verifies each capability with a real test.**

[Lore (rac-core)](https://github.com/itsthelore/rac-core) keeps your product's capabilities as typed, read-only knowledge — requirements as code. Proofkeeper is the **verification arm** of that corpus: a bring-your-own-model agent that reads the capabilities Lore already records (over the published `rac export --graph` contract), drives your product to exercise each one, compiles the working session into a durable end-to-end test, and proposes linking that test back to the capability it proves. It produces **verification evidence and nothing else** — not code review, not codegen. It is a **contract consumer** of Lore, never an extension of its engine: Lore owns the knowledge; Proofkeeper produces and runs the evidence.

## How it compares

Proofkeeper isn't a record-and-watch tool or an automated reviewer — it turns an agent's exploratory run into a **re-runnable test a human reviews**. The differentiator is the durable artifact: a committed Playwright test plus its replayable trace, gated on fidelity, rather than a watch-once recording or a one-off review pass.

| | Proofkeeper | Record-and-watch (e.g. Devin) | Automated review (e.g. Factory) |
|---|---|---|---|
| Output of a verification | committed test **+ replayable trace** | watch-once annotated video | a review pass on the PR |
| Re-runnable | yes — `npx playwright test` | no | n/a |
| Flakiness handling | the **fidelity gate** (N green re-runs) | none | n/a |
| Knowledge write-back | `## Verified By` via PR (ADR-084) | proposes a Skill via PR | AGENTS.md conventions |
| Model | **bring your own** | bundled | bundled |

## Quickstart

1. **Install** dependencies (Node ≥ 20):

   ```bash
   npm install && npm run build
   ```

2. **See what's unverified** in a Lore corpus (shells out to `rac export --graph`, or pass a graph file):

   ```bash
   proofkeeper coverage --corpus path/to/rac/
   ```

3. **Scaffold** a config from the same graph (one capability per requirement):

   ```bash
   proofkeeper init --corpus path/to/rac/ --url http://localhost:3000
   ```

4. **Verify** a capability end-to-end — drive, compile, fidelity-gate, and (optionally) propose the write-back:

   ```bash
   ANTHROPIC_API_KEY=… proofkeeper qa --corpus path/to/rac/ --url http://localhost:3000/
   ```

The bundled Claude adapter is used when `ANTHROPIC_API_KEY` is set; bring any other provider by calling `runQa()` from the library with your own `ModelClient`.

## Install

| Command | Gets you |
|---|---|
| `npm install` | the library and the `proofkeeper` CLI |
| `npx playwright install chromium` | the browser the drive and runner need |
| `npm i @anthropic-ai/sdk` | the optional reference Claude adapter (BYO-model otherwise) |

Requires Node ≥ 20. Published as `@itsthelore/proofkeeper`; the CLI binary is `proofkeeper`. The model SDK is an **optional** peer dependency — installing Proofkeeper never pulls in a model.

## How it works

<!-- Given a capability Lore records, Proofkeeper drives → compiles → fidelity-gates → runs → proposes. -->

- **Drives** your product the way a developer would — an agent loop with a **browser, a terminal, and HTTP** (ADR-083, ADR-085), using *your* model. It records only what succeeds.
- **Compiles** that working session into a durable Playwright `.spec.ts` with a deterministic emitter — record and replay agree.
- **Gates on fidelity** by re-running each emitted test N times and keeping only the green, stable ones. This faithful session→test conversion is the moat.
- **Runs** the compiled suite fast, emitting a replayable trace per run.
- **Reports** which Lore capabilities are unverified, and proposes `## Verified By` links back to the corpus through a **human-reviewed pull request** (ADR-065) — never a direct write.

## The boundary

Proofkeeper is a **contract consumer** of Lore, and the boundary is load-bearing:

- **Reads the published contract only.** It consumes `rac export --graph` to learn which capabilities lack a verifying test. It never imports the Lore engine's internals.
- **Bring-your-own-model.** No model or inference is bundled; the agent runtime lives here, never in the Lore engine.
- **Write-back is a proposal, never a mutation.** It opens a pull request a human reviews (ADR-065) — it never writes a corpus directly.
- **Verification only.** Proofkeeper "produces verification evidence and nothing else"; code review and codegen are explicit non-goals, owned by sibling products.

## The coverage signal

A requirement node in `rac export --graph` is a product **capability**; the engine emits a typed `verified_by` edge from a capability to each test that verifies it (an external-target reference, ADR-084). A capability is **unverified** when it has no such edge — a pure, deterministic signal, no browser and no model required.

```bash
proofkeeper coverage --graph-file graph.json          # from a graph export
proofkeeper coverage --corpus path/to/rac/ --json     # shell out to rac; machine-readable
```

Exit codes are a stable contract: `0` everything verified, `1` one or more unverified (gates cleanly in CI), `2` usage error.

## Verify a capability

`proofkeeper qa` (alias `verify`) runs the whole loop behind one command: pick an unverified capability → drive → compile → fidelity → run → optionally propose the write-back. With `--config`, it scopes to a pull request — driving every unverified capability the changed files touch, concurrently and context-isolated, and posting the evidence as a single comment that updates in place.

```bash
# Verify a specific capability and, when stable, open the write-back PR:
ANTHROPIC_API_KEY=… GITHUB_TOKEN=… proofkeeper qa \
  --corpus path/to/rac/ --url http://localhost:3000/ \
  --capability REQ-CHECKOUT --n 5 \
  --propose --repo itsthelore/your-corpus --target-path rac/requirements/checkout.md
```

Pass `--plan` to have the model write a human-readable test plan before driving. The drive has a **browser, a terminal, and HTTP**: `run_command` / `expect_output` / `expect_exit` for CLI capabilities, and `request` / `expect_status` / `expect_json` for API capabilities — a session may interleave all three.

## Write-back

Once a test is stable, Proofkeeper proposes linking it to the capability it verifies by opening a **human-reviewed pull request** against the target's Lore corpus — it never commits the base branch (ADR-065). The `## Verified By` section records bare reference paths (the test and its replayable trace), so the engine's `verified_by` edge targets stay clean. Repository operations go through an injected `RepoGateway`, so there is no hard GitHub dependency.

The PR carries readable evidence — a numbered step summary of the driven flow and a `npx playwright show-trace` hint — so a reviewer reads what was exercised, then re-runs the committed test to confirm. The merged artifact validates against the real engine, and the new `verified_by` edge flips the capability to verified in `proofkeeper coverage`.

## Bring your own model

Proofkeeper bundles no model — you implement `ModelClient` against your provider, or use the optional reference `ClaudeModelClient` (lazily imports `@anthropic-ai/sdk`).

```ts
import { AutonomousDriver, CodegenCompiler, PlaywrightRunner, assessFidelity } from "@itsthelore/proofkeeper";
import { chromium } from "@playwright/test";

const model = {
  async complete(request) {
    /* call your LLM with request.transcript and request.tools */
    return { toolCalls: [/* { name, arguments } */] };
  },
};

const page = await (await chromium.launch()).newPage();
const { session } = await new AutonomousDriver(page, model, {
  capabilityId: "REQ-VERIFY",
  title: "verify flips status to verified",
  startUrl: "http://localhost:3000/",
  goal: "Click Verify and confirm the status changes to 'verified'.",
}).drive();

const candidate = await new CodegenCompiler({ outDir: "tests/generated" }).compile(session);
const verdict = await assessFidelity(new PlaywrightRunner(), candidate, {
  n: 5,
  target: { name: "dev", baseURL: "http://localhost:3000/" },
});
```

## Failure-learning

When a drive doesn't finish or its compiled test fails the fidelity gate, the run is recorded against the capability through a pluggable `LearningStore`. The next drive of that capability is handed the prior reasons, so the model steers away from the same dead ends. The config's `failureLearning` strategy controls how the catalog is *surfaced* — the default `suggest_in_report` adds a "Known failure modes" section to the scoped-QA PR comment; repo-writing strategies stay behind the propose-only boundary (ADR-065).

## Origin

Proofkeeper is a sibling of **[Lore / RAC](https://github.com/itsthelore/rac-core)**, split out because **verification is a runtime concern, not a knowledge one** — the same reasoning that separated [Wayfinder](https://github.com/itsthelore/wayfinder-router) (prompt-complexity routing) from the engine. Lore records *what* a product should do and serves it read-only; Proofkeeper drives the product to prove it does, and proposes the evidence back through a human-reviewed PR. The two compose over the published `rac export --graph` contract (ADR-063, ADR-083): no engine change is required, and the `verified_by` edge already exists in the engine. Proofkeeper produces and runs the evidence; Lore records it.

> **Naming.** The product is **Proofkeeper**; the display brand is **Lore Proofkeeper** where disambiguation helps. It is unrelated to Epic Games' "Lore" version-control system — different audience, different tool.

## Repository layout

```text
lore-proofkeeper/
  src/              the library: coverage read-model, agent drive, session→test
                    compiler, fidelity gate, runner, and the write-back proposer
  src/cli.ts        the `proofkeeper` CLI (coverage, init, qa / verify)
  lore-proofkeeper/ the dogfood corpus — the requirements, designs, and roadmap
                    that govern Proofkeeper itself (verified by its own tests)
  tests/            vitest unit tests plus browser-gated e2e (PROOFKEEPER_E2E)
  examples/         the demo corpus, product page, and generated specs
  docs/             the build-shape and competitive notes
```

## Test

```bash
npm run typecheck   # strict TypeScript
npm test            # vitest unit tests (fast, hermetic — no browser)
npm run build       # emit dist/

# Browser-driven end-to-end checks (real Chromium), opt-in:
npx playwright install chromium
PROOFKEEPER_E2E=1 npx vitest run tests/runner.integration.test.ts
```

The default `npm test` is fully hermetic. The browser-driven integration tests are gated behind `PROOFKEEPER_E2E` so they run only when you opt in (and in the CI `e2e` job).

## Project status

Proofkeeper is an early **v0.0.1** prototype, evolving quickly: the full drive → compile → fidelity → run → write-back pipeline works end-to-end against a real corpus graph, and Proofkeeper verifies its own capabilities (`proofkeeper coverage --corpus lore-proofkeeper/` reports them green). Contributions and experiments welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[Apache-2.0](./LICENSE). Contributions require a DCO sign-off — see [CONTRIBUTING.md](./CONTRIBUTING.md).
