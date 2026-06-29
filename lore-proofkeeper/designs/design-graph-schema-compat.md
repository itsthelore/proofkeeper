---
schema_version: 1
id: PK-KWA6RDD08BEG
type: design
---
# Graph Schema-Version Compatibility Check

## Context

Proofkeeper is a contract consumer of Lore (ADR-063, ADR-083): it reads `rac export --graph` and never the engine internals. The graph's `schema_version` (ADR-007) is the contract's compatibility signal, but `parseGraph` read it and ignored it. This design adds an explicit, checked compatibility guarantee at the single parse choke point.

## User Need

A user running Proofkeeper against a rac whose graph contract has moved on should get a clear, fast failure — not silently wrong coverage — and should be able to read which schema_version Proofkeeper supports.

## Design

- A constant `SUPPORTED_GRAPH_SCHEMA` (currently `"1"`) is exported from the graph module.
- `parseGraph` — the single entry point behind the coverage, qa, and init commands — reads `schema_version` and: tolerates a missing or empty value (parses as before); refuses a present value that differs from the supported one with a `GraphParseError` naming both versions (mapping to CLI exit code 2).
- The README documents the supported version.

## Constraints

- Additive-tolerant (ADR-007): unknown graph fields are still ignored; only a present, differing schema_version is refused.
- No new dependency and no engine coupling — the check is a string comparison in the existing parser.
- A single supported value compared by equality for now; promote to a set if Proofkeeper ever supports more than one.

## Rationale

Validating in `parseGraph` covers every graph-loading command in one place. Erroring on a present mismatch (rather than warning) turns "should be compatible" into a guarantee, consistent with the engine's meaning of a schema_version bump as a breaking change.

## Alternatives

- **Warn and continue on mismatch.** Rejected: a breaking schema change can yield wrong coverage; failing fast is safer and is the requested behaviour.
- **Pin a rac-core package version.** Rejected: Proofkeeper depends on the published contract, not a package (ADR-063) — there is no package dependency to pin.

## Accessibility

Not applicable — a parser check; output is a plain CLI error string.

## Style Guidance

Keep the error actionable: name the seen version, the supported version, and the remedy.

## Open Questions

- Whether to support a range or set of schema_versions once a second version exists. Deferred until then.

## Related Requirements

- req-graph-schema-compat

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
