---
schema_version: 1
id: PK-KWFWJMV2DBWA
type: requirement
---
# Drive Resilience — Timeouts, Isolation, Budgets, Audit

## Problem

Nothing in the pipeline bounded wall-clock time or spend, and one failure could
destroy unrelated work. A stalled model call, a hung shell command, a hung
Playwright or rac process each blocked the pipeline forever; a single transient
provider error aborted an otherwise-recoverable capability; a throwing drive
inside a scoped run rejected the pool and discarded every sibling capability's
completed result; a runner exception aborted the fidelity gate instead of
counting as a failed attempt. Meanwhile the transcript grew unbounded (a full
observation re-appended every turn), token spend was invisible, and the loop
left no record of what the agent actually did.

## Requirements

- [REQ-001] Every external await is time-boxed: model calls, shell commands (recorded and replayed), Playwright invocations, the rac graph export, and the git diff each carry a wall-clock cap whose expiry surfaces as an error, never a hang.
- [REQ-002] A failed model call is retried once with backoff before the drive gives up, and the final error names both failures.
- [REQ-003] A runner exception during the fidelity gate counts as a failed attempt with a recorded reason on the verdict; the gate always completes its N attempts.
- [REQ-004] In a scoped run, one capability's exception becomes that capability's error entry; sibling capabilities' results are never discarded.
- [REQ-005] Observation text and ARIA blocks are capped per turn with an explicit truncation marker, bounding transcript growth.
- [REQ-006] Provider-reported token usage is surfaced by the bundled adapters, accumulated per drive, and shown in the QA summary; `--verbose` logs each turn's tool calls, errors, and model latency as an audit trail.

## Success Metrics

- A stalled model call errors at the cap instead of hanging; a transient 5xx
  no longer aborts a capability.
- A scoped run with one throwing capability still reports every sibling's
  verdict.
- A drive on a usage-reporting provider prints its token totals; a hung
  `sleep`-style command errors within its cap.

## Risks

- Caps that are too tight fail slow-but-healthy runs. Mitigation: generous
  defaults (2 min model/command, 10 min per Playwright invocation), and the
  model timeout and command timeout are overridable.
- A retry doubles cost on genuinely dead providers. Mitigation: exactly one
  retry, with both errors reported.

## Assumptions

- Provider `usage` fields (Anthropic `input_tokens`/`output_tokens`, OpenAI
  `prompt_tokens`/`completion_tokens`) remain stable contract surfaces.
- The head of a page's text/ARIA carries the signal locators need, so clipping
  the tail loses little.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `tests/drive-loop.test.ts`
- `tests/fidelity.test.ts`
- `tests/scoped-qa.test.ts`
- `tests/observe.test.ts`
