---
schema_version: 1
id: PK-KWFVX9H4FDSE
type: requirement
---
# "Verified" Means Verified

## Problem

Proofkeeper's product promise is the word "verified", and four gaps let it be
claimed without being earned. A drive that stopped issuing tool calls was
scored as finished (the completion check was vacuously true for both bundled
adapters), so give-ups looked like successes and never reached the failure
learning store. A session that asserted nothing compiled to a trivially-green
spec and passed the fidelity gate. Emitted locators matched by substring, so a
later DOM addition could silently re-target a committed test. And two contract
edges misreported: a numeric graph `schema_version` bypassed the compatibility
guard as "omitted", and a Playwright report with zero results — or with
configured retries — was mislabelled instead of surfaced.

## Requirements

- [REQ-001] A drive is finished only when the model explicitly calls `finish`; a turn with no tool calls is a give-up, distinguished from the step budget, and recorded to the failure-learning store with the model's final text.
- [REQ-002] A session with no recorded assertions is never compiled or gated: the QA loop reports it unverified with the reason, and the emitter refuses assertion-free sessions outright.
- [REQ-003] Emitted role-name, text, and label locators match exactly, and the recorder resolves with the same exactness — an assertion that held at record time means the same thing on replay.
- [REQ-004] A numeric graph `schema_version` counts as present: a supported value is accepted, an unsupported one is refused — it can never pass the guard as "omitted".
- [REQ-005] A Playwright report with no test results is refused with a diagnostic naming the likely cause (spec outside the config's testDir), never silently mapped to "failed"; when the target project configures retries, each test's final attempt is its outcome.

## Success Metrics

- A scripted give-up drive produces `verified: false` with a give-up reason and
  a learning record, without compiling.
- An assertion-free session is refused by the emitter and reported unverified
  by the QA loop.
- A flaky-then-green retried test reduces to "passed"; an empty report raises
  an actionable error.

## Risks

- Exact matching is stricter: a model that asserts a text fragment now fails at
  record time. Mitigation: the locator guidance tells the model matching is
  exact and to copy names verbatim; the recorder rejects at record time, so
  nothing weaker is ever committed.
- Give-up semantics depend on models using the `finish` tool. Mitigation: the
  system prompt instructs it, and a non-finishing drive degrades to an honest
  "unverified", never a false "verified".

## Assumptions

- The `finish` tool remains the completion signal for every adapter.
- Playwright's JSON report continues to append one result per retry attempt,
  final attempt last.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `tests/drive-loop.test.ts`
- `tests/compiler-emit.test.ts`
- `tests/playwright-report.test.ts`
- `tests/coverage.test.ts`
