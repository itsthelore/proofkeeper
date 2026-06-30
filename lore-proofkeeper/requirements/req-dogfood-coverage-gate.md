---
schema_version: 1
id: PK-KWBH4H0WB6VH
type: requirement
---
# Self-Verification Coverage Gate

## Problem

Proofkeeper dogfoods itself: its own capabilities live as requirements in `lore-proofkeeper/`, and `proofkeeper coverage --corpus lore-proofkeeper/` reports which have a verifying test. But nothing enforced that report — a capability could be added without a `## Verified By` link and the corpus would quietly drift un-green, undermining the product's own promise. The dogfood signal was advisory, not a gate.

## Requirements

- [REQ-001] Continuous integration runs `proofkeeper coverage` against Proofkeeper's own corpus on every push and pull request, and fails the build when any capability is unverified.
- [REQ-002] The gate uses Proofkeeper's own published CLI behaviour (coverage exits non-zero when a capability has no verifying test), not a bespoke script, so Proofkeeper verifies itself the same way it verifies any consumer.
- [REQ-003] The gate obtains the graph through the supported contract path — the `rac` CLI exporting the corpus — rather than a committed snapshot that could drift.
- [REQ-004] The self-verification status is visible from the README as a badge reflecting the gate's latest result on the default branch.

## Success Metrics

- A pull request that adds a capability without a verifying test fails CI on the coverage gate.
- The README badge shows the dogfood gate passing on the default branch when the corpus is fully verified.

## Risks

- The gate depends on installing the `rac` engine in CI; an upstream rac-core breakage could fail the job for reasons unrelated to Proofkeeper. Mitigation: install the engine from its repository as a contract dependency, and rely on the graph schema_version guard to distinguish a genuine contract break from noise.
- A flaky external install could make the gate noisy. Mitigation: keep the job minimal and cache where possible; the gate's only product step is the deterministic coverage command.

## Assumptions

- The `rac` engine is installable from the rac-core repository and exposes `rac export <dir> --graph` (the published contract).
- `proofkeeper coverage` continues to exit non-zero when any capability is unverified.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `.github/workflows/dogfood.yml`
