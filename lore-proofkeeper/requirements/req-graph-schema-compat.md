---
schema_version: 1
id: PK-KWA6RCRQ6J3W
type: requirement
---
# Graph Schema-Version Compatibility Check

## Problem

Proofkeeper consumes rac-core only through the published `rac export --graph` contract, not a pinned package. The graph carries a `schema_version` the engine increments only on a breaking contract change (ADR-007), but Proofkeeper read that field without checking it — so a future incompatible graph would be parsed best-effort and could produce wrong coverage silently. Compatibility was implicit; it should be an explicit, checked guarantee.

## Requirements

- [REQ-001] Proofkeeper declares the `rac export --graph` schema_version it supports and exposes it as a stable constant.
- [REQ-002] Parsing a graph whose schema_version is present and not the supported value fails with a clear, actionable error (CLI exit code 2) instead of producing coverage.
- [REQ-003] A graph that omits schema_version is tolerated and parsed as before, so loose or older inputs keep working.
- [REQ-004] The supported schema_version is documented in the README so consumers know the compatibility guarantee.

## Success Metrics

- A graph declaring an unsupported schema_version is refused across every command that loads a graph (coverage, qa, init), with a message naming both the seen and supported versions.
- A graph at the supported version, and a graph omitting the field, both parse unchanged.

## Risks

- Refusing a different schema_version blocks consumers whose rac is newer than their Proofkeeper. Mitigation: the error names the remedy (update Proofkeeper, or check the rac version), and only a present-and-different version is refused — additive fields stay tolerated.

## Assumptions

- The engine increments schema_version only on breaking changes to the graph contract (ADR-007).
- The graph export includes schema_version in normal operation; absence implies a loose or legacy input.

## Related Roadmaps

- autonomous-qa-enhancements
