---
schema_version: 1
id: PK-KVZVEFG6SWE9
type: requirement
---
# Test Plan Stage Before Codegen

## Problem

Proofkeeper's drive jumps straight from a goal to recording browser/terminal actions,
so the only human-readable account of what was verified is the compiled test code. Every
surveyed autonomous-QA tool (Playwright's Planner→Generator, QA Wolf's Mapping→Code Writer)
first emits a human-readable plan and only then writes code. A reviewer reading a write-back
pull request has no concise statement of the flow the agent intended to exercise before they
read the spec.

## Requirements

- [REQ-001] The drive can run an optional planning turn before acting, in which the model emits a human-readable Markdown test plan of the steps it will take and the outcomes it will assert.
- [REQ-002] The plan is recorded on the produced session so it travels with the compiled candidate test.
- [REQ-003] When a write-back is proposed, the recorded plan is surfaced in the pull-request body and confirmation comment, above or alongside the step summary.
- [REQ-004] Planning is opt-in and off by default, so the existing drive behaviour and its tests are unchanged when planning is not requested.

## Success Metrics

- With planning enabled, a driven capability's write-back pull request shows a readable test
  plan before the test code.
- With planning disabled, the drive produces byte-identical sessions to today.

## Risks

- A model may emit a plan it does not then follow. Mitigation: the plan is advisory context
  fed into the same transcript; the committed test still reflects the recorded actions, and
  the fidelity gate still governs trust.
- Token cost of an extra turn. Mitigation: planning is opt-in and a single turn.

## Assumptions

- The bring-your-own `ModelClient` can return a free-text response when asked for a plan with
  no tools offered that turn.
- Human pull-request review remains the trust boundary; the plan is informational.

## Related Roadmaps

- autonomous-qa-enhancements
