---
schema_version: 1
id: PK-KVZY8HXQPVBQ
type: design
---
# Personas in the Scope Config

## Context

The scope config now carries environments and auth. This design adds **personas** — the
`personas` block from Factory automated-qa's `config.yaml` (name, `test_focus`, `cannot_do`) —
and threads a selected persona into the drive goal so a capability is verified as a specific
role.

## User Need

A team needs to verify a capability *as a role*: drive the admin flow with admin focus, or
confirm a viewer cannot edit settings. The agent must be told the role's focus and forbidden
actions.

## Design

- **Config (`config.ts`):**
  - `PersonaConfig` = `{ name; testFocus?: string[]; cannotDo?: string[] }`.
  - `ProofkeeperConfig` gains `personas?: PersonaConfig[]`.
  - `CapabilityConfig` gains `persona?: string` (select a persona by name).
  - Parsed strictly but optional.
- **Resolution (`personaContext`)**: pure. Given the config and a capability, if the capability
  names a persona, return a goal-context string: "Act as the <name> persona." + focus +
  cannot-do. If the named persona is not defined, throw a `ConfigParseError`. Returns undefined
  when the capability names no persona.
- **Threading**: `runScopedQa` includes the persona context in the `goalContext` it builds
  (alongside environment restrictions and auth), so all role/environment directives reach the
  drive goal through `runQa`.

## Constraints

- Optional and additive: no behaviour change without personas.
- Advisory goal text: the fidelity gate and human review remain the guardrails (ADR-065).
- A referenced-but-undefined persona is an explicit error, never silently dropped.

## Rationale

A persona is a property of *how* a capability is driven, so threading it through `goalContext`
(the same channel as environment restrictions) keeps one consistent mechanism. Keeping
`personaContext` pure makes it unit-testable without a drive.

## Alternatives

- **Persona as a free-text goal per capability.** Rejected: personas are reusable across
  capabilities; naming them keeps the config DRY and the roles consistent.
- **Enforce cannot-do mechanically.** Deferred: advisory goal text plus the committed test is
  the initial surface; mechanical enforcement is a larger, separate change.

## Accessibility

Not applicable — configuration and prompt-context, no user surface.

## Style Guidance

Mirror the source field names (`test_focus` → `testFocus`, `cannot_do` → `cannotDo`). Keep the
persona context one short sentence.

## Open Questions

- Whether to drive a capability once per persona automatically. Deferred; a capability selects
  one persona for now.

## Related Requirements

- req-personas

## Related Roadmaps

- post-droid-enhancements

## Status

Accepted
