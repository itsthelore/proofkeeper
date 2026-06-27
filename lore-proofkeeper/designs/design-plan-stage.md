---
schema_version: 1
id: PK-KVZVEG2X0X55
type: design
---
# Test Plan Stage Before Codegen

## Context

The `AutonomousDriver` seeds the start URL, observes, then loops model→act→observe until
the model finishes. There is no explicit plan phase. This design adds an optional planning
turn so the model writes a human-readable test plan before driving — the Planner→Generator
shape common to Playwright Test Agents and QA Wolf — without changing the default behaviour.

## User Need

A reviewer of a write-back pull request needs a concise, plain-language statement of the
flow the agent set out to verify, before reading the generated spec, so they can judge
whether the right capability was exercised.

## Design

- Add `plan?: string` to `RecordedSession` (metadata; the emitter ignores it).
- Add `plan?: boolean` to `DriveOptions`. When set, before the action loop the driver runs
  one `ModelClient.complete` turn with **no tools**, prompting for a Markdown test plan; the
  text response becomes the plan. The plan is pushed into the drive transcript as assistant
  context, then the normal loop proceeds, and the plan is attached to the returned session.
- `runQa` passes `plan` through and, when proposing a write-back, threads `session.plan` to
  the proposer.
- `buildProposal` (PR body) and `renderWriteBackComment` (confirmation comment) render a
  "Test plan" block when a plan is present.
- The `qa` and scoped `qa --config` commands gain a `--plan` flag.

## Constraints

- Opt-in and off by default: with planning disabled, sessions and existing tests are
  unchanged.
- The plan is advisory: the committed test reflects recorded actions, and the fidelity gate
  still governs trust (ADR-065 unchanged).
- No new dependency; planning is one extra model turn through the existing `ModelClient`.

## Rationale

A no-tools turn cleanly elicits free text from any provider adapter (the response carries
`done` text rather than tool calls). Storing the plan on the session keeps it flowing through
compile to the write-back without a side channel.

## Alternatives

- **Derive the plan from the recorded actions after the fact.** Rejected: that is the
  existing step summary; a true plan stage states intent *before* acting and can shape the
  drive.
- **Make planning mandatory.** Rejected: it changes default behaviour and costs a turn for
  callers who do not want it.

## Accessibility

The plan renders as plain Markdown in the pull request; no colour or interaction dependency.

## Style Guidance

Keep the plan a short ordered list. Render it under a clear "Test plan" heading, distinct
from the after-the-fact "Steps exercised" summary.

## Open Questions

- Whether to let a reviewer approve the plan before the drive proceeds (a hard gate). Out of
  scope here; the plan is informational for now.

## Related Requirements

- req-plan-stage

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
