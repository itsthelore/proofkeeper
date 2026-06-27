---
schema_version: 1
id: PK-KVZXY6YM2J95
type: design
---
# Environments and Auth in the Scope Config

## Context

`ProofkeeperConfig` carries only `capabilities`, each with an optional `url`. This design adds
named environments (with restrictions), a default target, and an auth block — the
`environments` / `default_target` / `auth` shape from Factory's automated-qa `config.yaml` —
and threads the selected environment's restrictions and the auth context into the drive goal.

## User Need

A team needs Proofkeeper to target the right environment by name, to keep production
read-only, and to tell the agent how the product authenticates — without putting credentials
in the config.

## Design

- **Config (`config.ts`):**
  - `ProofkeeperConfig` gains `environments?: Record<string, { url; restrictions? }>`,
    `defaultTarget?: string`, and `auth?: { method; provider? }`.
  - `CapabilityConfig` gains `environment?: string` (select an environment by name).
  - All parsed strictly but optional; an existing config is unchanged.
- **Resolution (`resolveTarget`)**: pure. For a capability it returns `{ name, url,
  restrictions }`: an explicit `cap.url` wins (restrictions empty); else the environment named
  by `cap.environment ?? config.defaultTarget`; else a caller fallback URL; else undefined.
- **Auth context (`authContext`)**: a one-line string from the auth block, or undefined.
- **Threading**: `QaOptions` gains `goalContext?: string`; `runQa` appends it to the (given or
  derived) goal. `runScopedQa` resolves each capability's target, runs against the resolved
  URL/name, and builds `goalContext` from the environment restrictions and the auth context.

## Constraints

- Additive and optional: no behaviour change for a config without environments/auth.
- No credentials in config — method/provider only.
- Restrictions and auth are advisory goal text; the fidelity gate and human review remain the
  guardrails (ADR-065 unchanged).

## Rationale

Keeping resolution a pure function and threading context through a `goalContext` suffix avoids
duplicating the default-goal derivation and keeps `runScopedQa` declarative. Modeling
environments as a named map mirrors the source `config.yaml` one-to-one.

## Alternatives

- **Per-capability restrictions instead of per-environment.** Rejected: restrictions are a
  property of where you run (prod vs dev), not of the capability.
- **Bake restrictions into the runner.** Rejected: the runner executes a committed test; the
  restriction must shape the *drive*, which is where data gets created.

## Accessibility

Not applicable — configuration and prompt-context, no user surface.

## Style Guidance

Mirror the source `config.yaml` field names (`environments`, `default_target` → `defaultTarget`,
`auth`) so the mapping is obvious.

## Open Questions

- Whether to enforce restrictions mechanically (e.g. block non-GET requests on a read-only
  env). Deferred; advisory goal text is the initial surface.

## Related Requirements

- req-environments-auth

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
