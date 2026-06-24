# Lore Proofkeeper

> Autonomous verification for the Lore family. Proofkeeper *keeps the proof* —
> the stable test plus its replayable trace — so an agent's work is verified by
> reading the committed test and its trace in the pull request, not by a local
> run.

**Status: v0.0.1 prototype.** This is an early vertical slice, and the moat now
has a working first case. The coverage read-model (below) works end-to-end. The
local Playwright runner and the fidelity gate are real: the runner drives an
actual browser, parses Playwright's JSON report into typed results, and emits a
replayable trace per run; the gate accepts a test only after N green re-runs.
And the **session→test compiler is real for a recorded drive**: a `Recorder`
captures real browser actions (recording each only after it succeeds), and a
deterministic emitter compiles that trace into a `.spec.ts` that passes the
fidelity gate. Still deferred: the *autonomous* drive — a BYO-model agent
deciding the actions on its own (see [Scope](#v001-scope)).

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
end-to-end; a **real** local Playwright runner that drives a browser, parses the
JSON report into typed results, and emits a replayable trace, gated by the
fidelity gate over N green re-runs; a **real session→test compiler** — a
`Recorder` that captures faithful browser actions and a deterministic emitter
that compiles them into a `.spec.ts`, proven end-to-end by recording a drive of
a served product, compiling it, and passing the fidelity gate 3× green; a
propose-only `## Verified By` write-back renderer.

**Deferred (named, not silently dropped):** the *autonomous* drive — a BYO-model
agent deciding the actions to record (the `Recorder` is driven by the caller
today); generalization of the recorder beyond the core action set; the
cross-target/cross-OS matrix and VM-fabric runner; Proofkeeper Cloud (the hosted
commercial tier); automated PR write-back; an `lore` MCP client.

## License

[Apache-2.0](./LICENSE). Contributions require a DCO sign-off — see
[CONTRIBUTING.md](./CONTRIBUTING.md).
