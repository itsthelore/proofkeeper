---
schema_version: 1
id: PK-KVZTQSS42107
type: roadmap
---
# Post-DROID Enhancements

## Outcomes

- Proofkeeper presents verification evidence the way reviewers expect: one
  canonical, in-place pull-request comment per change rather than an accreting
  thread.
- An agent's driven flow is reviewable as a human-readable plan before it is read
  as code, sharpening trust in the committed test.
- Verification covers API/HTTP surfaces, not only the browser and terminal, so
  capabilities that are really service contracts can be verified directly.
- Scoped QA runs fast and reliably at pull-request time by isolating each
  capability's drive from the others.
- The drive decides from richer live signal (console and network feedback), so it
  produces more faithful tests with fewer wasted steps.

## Initiatives

These follow a competitive deep-research sweep of autonomous-QA agents (Factory
DROID, Playwright Test Agents, QA Wolf, Ranger, Momentic). Each is an in-scope
extension of Proofkeeper's verification mandate (recorded as ADR-083 in the engine
corpus); none is code review or codegen.

### Idempotent pull-request comment

One canonical QA comment per pull request that updates in place, keyed by a hidden
marker, instead of a new comment per run. Serves the evidence-presentation outcome.

### Plan stage before codegen

An optional planning turn where the model emits a human-readable Markdown test plan
before driving, surfaced in the pull request. Serves the reviewable-plan outcome.

### API/HTTP driver

A first-class HTTP request/assert modality alongside the browser and terminal,
gated on a new engine-side decision recording the third modality. Serves the
API-coverage outcome.

### Parallel, context-isolated scoped QA

Drive the capabilities a change touches concurrently, each in its own isolated
context, instead of sequentially. Serves the fast-reliable-scoped-QA outcome.

### Richer drive observation

Feed recent console messages and network responses into the model's observation
each turn. Serves the faithful-tests outcome.

## Success Measures

- A pull request shows exactly one Proofkeeper QA comment regardless of how many
  times the run fires.
- A driven capability's plan is readable in the pull request before the test code.
- An HTTP-only capability is verified end-to-end and recorded with a Verified By
  link, only after the new modality decision is accepted.
- Scoped QA over several touched capabilities completes in roughly the time of the
  slowest single capability, not their sum.
- The drive references console and network signal when deciding actions, observable
  in its recorded transcript.

## Assumptions

- The published Lore contract (`rac export --graph`) and the injected GitHub
  gateway remain the integration surfaces; no engine internals are consumed.
- Human pull-request review stays the trust boundary for every write-back and for
  the new modality decision.

## Risks

- Scope drift toward general automation or codegen erodes the verification
  boundary. Mitigation: each initiative is fenced to producing verification
  evidence, and the API modality is gated on a recorded decision rather than
  assumed.
- Parallel drives contend for browser and runner resources. Mitigation: a bounded
  concurrency pool and per-capability output isolation.
