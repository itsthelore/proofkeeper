---
schema_version: 1
id: PK-KVZY8H83T7BT
type: requirement
---
# Personas in the Scope Config

## Problem

Products behave differently for different user roles: an admin can edit settings and manage
users; a viewer can only read dashboards. Verifying a capability often means driving it *as a
particular role*, and asserting that a role *cannot* do what it should not. Factory's
automated-qa `config.yaml` models this with `personas` (name, `test_focus`, `cannot_do`).
Proofkeeper has no persona model, so a capability cannot be driven as a specific role and the
agent is not told a role's focus or forbidden actions.

## Requirements

- [REQ-001] The config supports named personas, each with a name and optional test-focus areas and forbidden actions (cannot-do).
- [REQ-002] A capability can select a persona by name; the persona's focus and forbidden actions are threaded into the drive goal so the agent acts as that role.
- [REQ-003] Personas are optional and additive: a config without personas, or a capability without a persona, behaves exactly as before.
- [REQ-004] Referencing a persona name that is not defined is a config error, surfaced at parse-resolution time, not silently ignored.

## Success Metrics

- A capability with a persona is driven with a goal that names the role, its focus, and what
  it must not do.
- A config with no personas produces identical behaviour to before this change.

## Risks

- Persona directives are advisory goal text. Mitigation: they are explicit in the goal; the
  committed test and human review remain the guardrails.
- A persona's forbidden actions overlap with environment restrictions. Mitigation: both are
  appended to the goal; they reinforce rather than conflict.

## Assumptions

- A persona is identified by a unique name within the config.
- The model can follow a role directive expressed as goal text.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `tests/scope-config.test.ts`
- `tests/scoped-qa.test.ts`