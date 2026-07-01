---
schema_version: 1
id: PK-KWFVXA7HJBYQ
type: design
---
# Verified Semantics — Finish, Assert, Match Exactly, Refuse Ambiguity

## Context

A review of the loop found the "verified" claim could be produced without
verification: completion was inferred from a field both adapters always set,
assertion-free sessions gated green, locators matched by substring, and two
contract edges (numeric `schema_version`, empty or retried Playwright reports)
were misread. This design closes each gap at its narrowest choke point.

## User Need

A reviewer merging a `## Verified By` link — and a maintainer reading
`proofkeeper qa` output — must be able to trust that "verified" means: the
model explicitly finished, at least one observable outcome was asserted, the
committed locators mean the same thing on replay, and contract anomalies were
refused rather than guessed at.

## Design

- **Finish is explicit.** `DriveResult` gains `stopReason:
  "finished" | "gave_up" | "step_budget"` (plus `gaveUpText`); `finished` is
  true only for an explicit `finish` tool call. The vacuous
  `done !== undefined` check is gone. `runQa` records give-ups and budget
  exhaustion to the learning store with distinct reasons.
- **Assertions are required.** `sessionAssertsOutcome` (compiler IR) names the
  assertion action types; `runQa` skips compile/gate for assertion-free
  sessions (`QaResult.loop` becomes optional, `unverifiedReason` says why), and
  `emitSpec` refuses them as it already refused empty sessions.
- **Exact locators, both sides.** The emitter renders `{ exact: true }` for
  role-name, text, and label locators, and the Recorder resolves with the same
  exactness — record/replay agreement is the invariant, so the change is made
  in both places in the same commit. The locator guidance tells the model to
  copy names verbatim.
- **Contract edges refuse, don't guess.** `parseGraph` stringifies a numeric
  `schema_version` before comparing, so `2` is refused and `1` accepted.
  `reduceReport` groups results per test and takes each test's final attempt
  (retries append attempts); zero results raises `ReportParseError` naming the
  testDir/testMatch cause instead of returning "failed".

## Constraints

- `QaResult.loop` optional is the only public-shape change; CLI rendering
  guards it and prints the unverified reason.
- Emitted specs remain byte-deterministic; the exact-matching change alters
  emitted bytes once, uniformly.
- No new dependency.

## Rationale

Each fix lands at the single point every caller flows through: the loop's stop
handling, the emitter's refusal, the one locator-resolution seam per side, the
one graph parser, the one report reducer. The QA loop refuses to compile
assertion-free sessions *and* the emitter refuses them — the loop gives the
honest verdict, the emitter makes the invariant unconditional for library
callers.

## Alternatives

- **Nudge the model on a no-tool-call turn instead of stopping.** Deferred: a
  retry prompt spends tokens to mask a model that has already disengaged;
  honest give-up plus failure-learning steers the next attempt instead.
- **Treat an empty report as a distinct RunStatus.** Rejected: every consumer
  would need to handle a fourth status; an exception with a diagnostic is the
  existing infra-failure channel.
- **Substring locators with strict-mode suppression.** Rejected: it trades a
  loud record-time failure for a silent wrong-element match on replay.

## Accessibility

Not applicable — loop semantics and parser behavior; user surface is CLI text,
which now names why a capability is unverified.

## Style Guidance

Unverified reasons are complete sentences a maintainer can act on ("drive gave
up after 4 step(s): …", "no tests matched — check testDir").

## Open Questions

- Whether a single retry nudge on give-up earns its token cost. Measure
  give-up rates from the learning store first.

## Related Requirements

- req-verified-semantics

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
