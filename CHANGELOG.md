# Changelog

User-visible changes to Proofkeeper, by release. Follows the spirit of
[Keep a Changelog](https://keepachangelog.com/): user impact over implementation
details, release history over commit history.

Releases use **CalVer** (`YYYY.MM.N`, ADR-076) and are cut as GitHub Releases
that publish `@itsthelore/proofkeeper` to npm with provenance. Author the
**zero-padded** form (e.g. `2026.06.4`) in `package.json` and the release tag,
consistent with the rest of itsthelore; the release workflow strips the month
padding to a valid npm version (`2026.6.4`) at publish, because npm's strict
SemVer forbids leading zeros. The release tag and `package.json` version must
match exactly, or the workflow fails the publish.

## 2026.07.1 — the "any model" release

The release that makes **bring-your-own-model** mean *any* model — and proves Proofkeeper on itself. Everything since the first cut:

- **Drive on any model, from the CLI.** A built-in **OpenAI-compatible adapter** speaks the `/chat/completions` format shared by OpenAI, OpenRouter, Together, Groq, Ollama, vLLM, and most local runtimes. Set `OPENAI_API_KEY` (and, for non-OpenAI targets, `OPENAI_BASE_URL` / `OPENAI_MODEL`) and Proofkeeper drives on it — **no new dependency** (it uses the platform `fetch`). The optional Claude adapter still works via `ANTHROPIC_API_KEY`; bring anything else by implementing `ModelClient`.

- **Verify browser extensions.** Point Proofkeeper at an unpacked extension with `--extension <dir>` (or a per-environment `extensionPath`). It loads the extension in a persistent context, lets the model drive the extension's own pages (`chrome-extension://…/popup.html`, options) and its effect on web pages, and **compiles a test that re-loads the extension and re-discovers its runtime ID** — so the committed spec and the fidelity gate verify the real extension, never a stale ID. MV3 Chromium, unpacked.

- **Proofkeeper proves itself.** A new **Dogfood** CI gate runs `proofkeeper coverage` over Proofkeeper's own Lore corpus and fails on any unverified capability, so the corpus can never silently drift un-green — with a README **Dogfood** badge tied to the live result.

- **An explicit, checked contract guarantee.** Proofkeeper now checks the `rac export --graph` **`schema_version`** (it supports `1`) and refuses an unsupported graph with a clear, actionable error instead of parsing it best-effort. A graph that omits the field is tolerated. Per ADR-007 the engine bumps `schema_version` only on a breaking change, so this turns "should be compatible" into a guarantee.

- **Tokenless releases.** Publishes to npm via **Trusted Publishing (OIDC)** — no long-lived token, provenance automatic.

## 2026.06.0 — the "first proof" release

The first cut of **Proofkeeper** — the open-source autonomous-QA agent for [Lore](https://github.com/itsthelore/rac-core), and the OSS answer to Factory's DROID, **bounded to verification**. Hand it real developer tools — a **browser, a terminal, and HTTP** — and **your own model**, and it drives your product to prove each capability works, then leaves **durable, re-runnable evidence** in a pull request. It does in the open what DROID's autonomous-QA half does behind closed doors. Lore records *what* your product should do (requirements as code); Proofkeeper proves it does, and proposes the evidence back for human review (ADR-083).

DROID, Devin, and the rest hand you a watch-once recording or a one-off review pass. Proofkeeper hands you a **committed Playwright test and an interactive trace, gated on fidelity** — proof you re-run, not a video you rewatch.

The full drive → compile → fidelity → run → write-back loop, in this first release:

- **Know what's unverified before you spend a token.** `proofkeeper coverage` reads `rac export --graph` and reports which Lore capabilities have no verifying test — no browser, no model, exact and reproducible. It exits non-zero when anything is unverified, so it gates cleanly in CI.

- **Drives like DROID, on the model you choose.** DROID's tool surface in the open — a **browser, a terminal, and HTTP** (ADR-083, ADR-085) — driven by *your* model. None is bundled; an optional Claude adapter ships in the box. The agent records only what succeeds.

- **A passing session becomes a test that keeps passing.** The recorded session compiles to a deterministic Playwright `.spec.ts`, kept only after N green re-runs — the fidelity gate. That faithful session→test conversion, backed by a re-runnable test and an interactive trace, is the moat the proprietary agents don't give you.

- **The whole loop behind one command.** `proofkeeper qa` (alias `verify`) selects an unverified capability, drives, compiles, fidelity-gates, runs, and optionally proposes the write-back. Point it at a pull request with `--config` and it drives the capabilities the change touches — concurrently, context-isolated — and posts the evidence as one comment that updates in place.

- **Evidence lands by PR, never by fiat.** When a test is stable, Proofkeeper links it to the capability it verifies by opening a **human-reviewed pull request** that proposes a `## Verified By` section (ADR-065, ADR-084) — never a direct write. The PR carries a readable step summary and a `playwright show-trace` hint; once merged, the artifact validates clean against the engine and flips the capability to verified.

- **Configured from your graph, not from scratch.** `proofkeeper init` scaffolds a `proofkeeper.config.json` straight from the graph. The config drives named **environments** (restrictions + auth method), **personas** (roles), and a **failure-learning** strategy that surfaces recorded failure modes in the PR comment.

And it stays in its lane: **verification evidence, nothing else**. The other half of DROID — PR code review, codegen — is deliberately out of scope, owned by sibling Lore products (ADR-083). Proofkeeper dogfoods itself, too: `proofkeeper coverage --corpus lore-proofkeeper/` reports its own capabilities green.
