---
schema_version: 1
id: PK-KVZYHHBC4GP2
type: requirement
---
# Failure-Learning Strategy: Suggest in Report

## Problem

Proofkeeper already remembers failed attempts (the learning store feeds prior failure reasons
into the next drive). But those failures are invisible to a human reviewer — they live only in
a local file and steer the agent. Factory's automated-qa exposes a `failure_learning` strategy
(`suggest_in_report` by default, plus `auto_commit` and `open_a_pr`) that surfaces accumulated
failure knowledge. Proofkeeper should at least surface its failure catalog **in the
pull-request report** so a reviewer sees the known failure modes for the capabilities a change
touched.

## Requirements

- [REQ-001] The config supports a `failureLearning` strategy field with the values `suggest_in_report`, `auto_commit`, and `open_a_pr`, defaulting to `suggest_in_report`.
- [REQ-002] Under `suggest_in_report`, the scoped-QA pull-request comment includes a "Known failure modes" section listing the recorded failure reasons for each touched capability that failed or could not be driven.
- [REQ-003] The repository-writing strategies (`auto_commit`, `open_a_pr`) are recognized but, where they would write outside the propose-only / human-reviewed boundary (ADR-065), are surfaced as not-yet-wired rather than silently performed; the run falls back to surfacing the catalog in the report.
- [REQ-004] When no capability failed, the report contains no failure-modes section, and the field is optional and additive.

## Success Metrics

- A scoped run where a touched capability is unstable shows that capability's recorded failure
  reasons in the pull-request comment.
- A run with no failures, or no `failureLearning` field, behaves exactly as before plus the
  default strategy.

## Risks

- A noisy failure history floods the report. Mitigation: only failed/errored touched
  capabilities are listed, with their recorded reasons.
- The catalog-write strategies imply mutating the repo. Mitigation: they are gated behind the
  propose-only boundary and surfaced as deferred rather than performed.

## Assumptions

- The learning store persists failure reasons keyed by capability (it does).
- Surfacing the catalog in the report is the in-scope, human-reviewable strategy.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `tests/qa-command.test.ts`
- `tests/scoped-qa.test.ts`