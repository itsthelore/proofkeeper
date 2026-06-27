---
schema_version: 1
id: PK-KVZYHHZGG6PQ
type: design
---
# Failure-Learning Strategy: Suggest in Report

## Context

Proofkeeper's learning store records failed attempts and feeds them into the next drive
(drive-steering). Factory automated-qa adds a `failure_learning` strategy that surfaces
accumulated failure knowledge. This design adds the strategy field and implements
`suggest_in_report`: the scoped-QA pull-request comment surfaces the recorded failure modes for
the touched capabilities that failed.

## User Need

A reviewer reading the scoped-QA report needs to see *why* a touched capability is failing —
its accumulated failure reasons — not just that it is unstable, so they can decide what to do.

## Design

- **Config (`config.ts`):** `ProofkeeperConfig.failureLearning?: "suggest_in_report" |
  "auto_commit" | "open_a_pr"`, defaulting to `suggest_in_report`; parsed strictly to one of the
  three values.
- **Collection (`collectFailureSuggestions`)** in `run-scoped.ts`: given a `ScopedQaResult` and a
  `LearningStore`, return `{ id, title, reasons }[]` for each driven capability that failed
  (error or unstable) and has recorded failures.
- **Report (`renderScopedQaComment`)**: gains an optional `failureSuggestions` and renders a
  "Known failure modes" section.
- **CLI**: under `suggest_in_report` (the default), after the run the scoped command builds the
  suggestions from the learning store and includes them in the upsert-ed comment. Under
  `auto_commit` / `open_a_pr`, it prints a one-line note that catalog-write strategies are
  deferred (they would write outside the propose-only boundary) and still suggests in the
  report.

## Constraints

- Propose-only / human-review boundary (ADR-065): no strategy commits to the repo here;
  catalog-write strategies are surfaced as deferred.
- Optional and additive: no failures ⇒ no section; no field ⇒ the default strategy.
- The drive-steering learning (feeding prior failures into the next drive) is unchanged; this
  adds the *reporting* surface on top of it.

## Rationale

The learning store is already the failure catalog; the cleanest, in-scope strategy is to make
it *visible* in the human-reviewed report rather than mutate the repo. Keeping
`collectFailureSuggestions` a pure-over-the-store function makes it testable without a browser.

## Alternatives

- **Auto-commit catalog updates.** Rejected here: it writes to the repo outside the
  propose-only boundary; deferred and surfaced, not performed.
- **A new artifact per failure mode.** Rejected: failures are runtime evidence, not corpus
  artifacts (consistent with tests/traces living in the product repo).

## Accessibility

Not applicable — report content rendered as plain Markdown.

## Style Guidance

Render the failure-modes section compactly under a clear heading, after the per-capability
results, consistent with the existing scoped-QA comment.

## Open Questions

- Whether `open_a_pr` should propose catalog updates as a future, human-reviewed PR. Deferred;
  surfaced as not-yet-wired for now.

## Related Requirements

- req-failure-catalog

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
