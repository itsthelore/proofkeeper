---
schema_version: 1
id: PK-KVZXY69Q60F0
type: requirement
---
# Environments and Auth in the Scope Config

## Problem

The scope config models a capability's target only as a single optional `url`. Real projects
run against several named environments — a development URL the agent may freely exercise and
a production URL that must stay read-only — and they have an authentication shape the agent
needs to know about. Factory's automated-qa `config.yaml` carries exactly this: named
`environments` with `restrictions`, a `default_target`, and an `auth` block. Without it,
Proofkeeper cannot target environments by name or respect a "never create data on prod"
restriction, and the model is not told how to authenticate.

## Requirements

- [REQ-001] The config supports named environments, each with a URL and optional restrictions, plus a default target environment.
- [REQ-002] A capability can select an environment by name; otherwise the default target is used, and an explicit capability URL still overrides any environment.
- [REQ-003] The config supports an auth block (method and optional provider) describing how the product authenticates.
- [REQ-004] When a capability is driven, the selected environment's restrictions and the auth context are threaded into the drive goal so the model respects them.
- [REQ-005] All new config fields are optional and additive: an existing config without environments or auth parses and behaves exactly as before.

## Success Metrics

- A capability targeting a named environment is driven against that environment's URL, and a
  restricted environment's restrictions appear in the drive goal.
- A config with no environments/auth produces identical behaviour to before this change.

## Risks

- Restrictions are advisory text the model may not honour perfectly. Mitigation: they are
  stated explicitly in the goal; the committed test and human review remain the guardrails.
- Auth secrets must never live in the config. Mitigation: the config describes the auth
  method/provider only, never credentials.

## Assumptions

- Credentials are supplied out of band (environment variables / CI secrets), never in the
  config file.
- Restriction strings are human-readable directives the model can follow.

## Related Roadmaps

- autonomous-qa-enhancements
