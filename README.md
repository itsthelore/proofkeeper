# Lore Proofkeeper

> Autonomous verification for the Lore family. Proofkeeper *keeps the proof* —
> the stable test plus its replayable trace — so an agent's work is verified by
> reading the committed test and its trace in the pull request, not by a local
> run.

**Status: v0.0.1 prototype.** The full drive→compile→fidelity→run pipeline now
works end-to-end. The coverage read-model (below) runs against a real corpus
graph. The local Playwright runner and the fidelity gate are real: the runner
drives an actual browser, parses Playwright's JSON report into typed results,
and emits a replayable trace per run; the gate accepts a test only after N green
re-runs. The **session→test compiler is real**: a `Recorder` captures real
browser actions (recording each only after it succeeds) and a deterministic
emitter compiles that trace into a `.spec.ts`. And the **autonomous drive is
real**: a bring-your-own-model agent loop observes the page, decides the next
action, drives the product through the `Recorder`, and produces a session that
compiles into a fidelity-gated test — proven end-to-end with a model deciding
actions from page observations. Proofkeeper bundles no model; you supply a
`ModelClient`. And the **`## Verified By` write-back is real**: it merges the
verification links into a requirement artifact and proposes them as a
human-reviewed pull request (never a direct commit to the base branch) — the
merged artifact validates clean against the real engine (`rac validate` +
`rac relationships --validate`), and the resulting `verified_by` edge flips the
capability from unverified to verified in the coverage report (see
[Scope](#v001-scope)).

> **Naming.** The product is **Proofkeeper**; the display brand is **Lore
> Proofkeeper** where disambiguation helps. It is unrelated to Epic Games'
> "Lore" version-control system — different audience, different tool. The
> `itsthelore` handle and the role-noun name are the disambiguators.

## What it does

Given real developer tools — a browser and a terminal, **bring your own model** —
Proofkeeper:

1. **Drives** a product the way a developer would (an agent loop, run once, slow,
   exploratory);
2. **Compiles** that working session into durable Playwright end-to-end tests;
3. Asserts **fidelity** by re-running each emitted test N times and keeping only
   the green, stable ones (this faithful session→test conversion is the moat);
4. **Runs** the compiled suite fast and in parallel across targets and operating
   systems, emitting replayable traces;
5. Reports which Lore **capabilities are unverified**, and proposes
   `## Verified By` links back to the corpus through a human-reviewed pull
   request.

## The boundary

Proofkeeper is a **contract consumer** of Lore, not an extension of its engine.
This boundary is deliberate and load-bearing:

- **Reads the published contract only.** It consumes `rac export --graph` (and,
  later, the `lore` MCP) to learn which capabilities lack a verifying test. It
  never imports the Lore engine's internals or private API.
- **Bring-your-own-model.** No model or inference is bundled. The agent runtime
  lives here, in this sibling product — never in the Lore engine.
- **Write-back is a proposal, never a mutation.** Proofkeeper proposes
  `## Verified By` links by opening a pull request a human reviews. It never
  writes into a Lore corpus directly. Human PR review is the trust boundary.
- **Proofkeeper owns the runtime and the evidence** (browsers, runs, traces);
  **Lore owns the knowledge.** In one line: *Lore records and reports
  verification; Proofkeeper produces and runs the evidence.*

These follow the recorded Lore decisions ADR-083 (product identity and
boundary) and ADR-084 (the `verified_by` external-target relationship).

## The coverage signal

Proofkeeper's free, local hook into a Lore corpus is the **coverage
read-model**. A requirement node in `rac export --graph` is a product
*capability*. The engine emits a typed, directed `verified_by` edge from a
capability to each test/trace that verifies it. Because those targets are
external files (not corpus artifacts), the edge is always emitted with
`resolved: false` and the literal reference as its target.

A capability is **unverified** when it has no outgoing `verified_by` edge.
That's the whole signal — pure, deterministic, no browser and no model required.

```bash
# Report unverified capabilities from a graph export
proofkeeper coverage --graph-file graph.json

# Machine-readable, for CI gating
proofkeeper coverage --graph-file graph.json --json

# Convenience: shell out to `rac export --graph` if `rac` is on PATH
proofkeeper coverage --corpus path/to/rac/
```

Exit codes: `0` every capability is verified, `1` one or more are unverified
(so it gates cleanly in CI), `2` usage or parse error.

## Autonomous drive (bring your own model)

The `AutonomousDriver` observes the page, asks your model for the next action,
and drives the product through the `Recorder` — recording only what succeeds.
Proofkeeper bundles no model: you implement `ModelClient` against your provider.

A reference adapter for the Anthropic Claude API ships in the box —
`ClaudeModelClient` — but it is **optional**. `@anthropic-ai/sdk` is an optional
peer dependency, imported lazily, so installing Proofkeeper never pulls in a
model SDK. Use the adapter, or implement `ModelClient` directly for any provider:

```ts
import { chromium } from "@playwright/test";
import {
  AutonomousDriver, CodegenCompiler, PlaywrightRunner, assessFidelity,
  ClaudeModelClient, // optional reference adapter (needs `npm i @anthropic-ai/sdk` + ANTHROPIC_API_KEY)
} from "@itsthelore/proofkeeper";

// Option A — the reference Claude adapter (defaults to claude-opus-4-8):
const model = new ClaudeModelClient({ /* apiKey?, model?, thinking?, effort? */ });

// Option B — bring your own provider by implementing ModelClient:
const customModel = {
  async complete(request) {
    /* call your LLM with request.transcript and request.tools */
    return { toolCalls: [/* { name, arguments } */] };
  },
};

const page = await (await chromium.launch()).newPage();
const { session, finished } = await new AutonomousDriver(page, model, {
  capabilityId: "REQ-VERIFY",
  title: "verify interaction flips status to verified",
  startUrl: "http://localhost:3000/",
  goal: "Click Verify and confirm the status changes to 'verified'.",
}).drive();

// Compile the recorded session and keep it only if it is stable.
const candidate = await new CodegenCompiler({ outDir: "tests/generated" }).compile(session);
const verdict = await assessFidelity(new PlaywrightRunner(), candidate, {
  n: 5,
  target: { name: "dev", baseURL: "http://localhost:3000/" },
});
```

## Write-back (propose `## Verified By`)

Once a test is stable, Proofkeeper proposes linking it to the capability it
verifies — by opening a **human-reviewed pull request** against the target's
Lore corpus. It never commits to the base branch (ADR-065): it branches, commits
the merged artifact to the branch, and opens a PR base ← head. The merge is pure
and idempotent; re-proposing an already-present link opens no PR.

The `## Verified By` section records **bare reference paths** — the committed
test and its replayable trace, each as its own bullet — so the engine's
`verified_by` edge targets stay clean (no labels or inline decoration).

Repository operations go through an injected `RepoGateway`, so there is no hard
GitHub dependency — wire it to Octokit, the `gh` CLI, or a GitHub MCP client:

```ts
import { GitHubWriteBackProposer, linksFromResults } from "@itsthelore/proofkeeper";

const proposer = new GitHubWriteBackProposer(gateway /* your RepoGateway */, { baseBranch: "main" });

const result = await proposer.propose({
  capabilityId: "REQ-VERIFY",
  targetPath: "rac/requirements/verify.md",
  links: linksFromResults(candidate, verdict.stable ? runResults : []),
  fidelity: { attempts: 5, passed: 5, stable: true }, // optional: posts a confirmation comment
});
// result: { status: "proposed", url, number, headBranch, commentUrl? } | { status: "no-change", reason }
```

The merged artifact validates against the real engine (`rac validate` and
`rac relationships --validate` stay clean), and the emitted `verified_by` edge
turns the capability from unverified to verified in `proofkeeper coverage`.

## Install & develop

```bash
npm install
npm run typecheck   # strict TypeScript
npm test            # vitest unit tests (fast, no browser)
npm run build       # emit dist/

# Browser-driven end-to-end checks (real Chromium):
npx playwright install chromium
npx playwright test                              # run the seed spec
PROOFKEEPER_E2E=1 npx vitest run \
  tests/runner.integration.test.ts              # runner + fidelity gate, real browser
```

The default `npm test` is fully hermetic — no browser required. The runner and
fidelity-gate integration tests launch a real browser and are gated behind
`PROOFKEEPER_E2E` so they run only when you opt in (and in the CI `e2e` job).

Requires Node ≥ 20. Published as `@itsthelore/proofkeeper` (npm). A
`lore-proofkeeper` PyPI counterpart may follow; the npm package is the
Playwright-native primary.

## v0.0.1 scope

**In:** repo scaffold (packaging, Apache-2.0 + DCO, CI); the coverage read-model
end-to-end; a **real** local Playwright runner (drives a browser, parses the JSON
report into typed results, emits a replayable trace) gated by the fidelity gate
over N green re-runs; a **real session→test compiler** — a `Recorder` that
captures faithful browser actions and a deterministic emitter that compiles them
into a `.spec.ts`; a **real autonomous drive** — a BYO-model agent loop
(`AutonomousDriver`) that observes the page, decides the next action, and drives
the product through the `Recorder`, proven end-to-end by a model deciding actions
from observations through compile + a 3× green fidelity pass; a **real
`## Verified By` write-back** — an idempotent artifact merge (validated clean
against the real engine) proposed as a human-reviewed pull request through an
injected `RepoGateway`, never a direct commit to the base branch.

It ships an **optional** reference `ModelClient` adapter for the Anthropic Claude
API (`ClaudeModelClient`), behind the bring-your-own-model boundary — the model
SDK is an optional peer dependency, never a hard one.

**Deferred (named, not silently dropped):** a bundled `RepoGateway` (the
write-back is gateway-agnostic — wire Octokit/`gh`/GitHub MCP, like the model
adapter); reference `ModelClient` adapters for other providers; a terminal tool
surface (the drive is browser-only today); generalization of the recorder/tool
set beyond the core actions; the cross-target/cross-OS matrix and VM-fabric
runner; Proofkeeper Cloud (the hosted commercial tier); an `lore` MCP client.

## License

[Apache-2.0](./LICENSE). Contributions require a DCO sign-off — see
[CONTRIBUTING.md](./CONTRIBUTING.md).
