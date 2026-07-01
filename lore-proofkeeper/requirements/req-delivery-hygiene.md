---
schema_version: 1
id: PK-KWFX3K4WPAXN
type: requirement
---
# Delivery Hygiene — Supply Chain, Lint, Matrix, Idempotent Write-Back

## Problem

The delivery pipeline had hardening gaps a review surfaced. The dogfood gate
installed rac-core from its default branch unpinned, executing whatever landed
there in this repository's CI on every push — non-reproducible and a supply
chain exposure. CI workflows ran with the default token scope instead of
least privilege, on a single Node version while the release built on a newer
one. No lint tooling guarded style regressions the type checker cannot see.
Config typos degraded silently at run time (an unknown environment fell back
to the default URL; a duplicate capability id was accepted). And a re-run of
the write-back was fatal rather than idempotent: an existing head branch made
branch creation throw 422, a busy pull request's marked comment beyond the
first hundred was missed and duplicated, and Windows path separators could be
written into corpus `## Verified By` references.

## Requirements

- [REQ-001] The dogfood gate installs rac-core pinned to a commit SHA, bumped deliberately; CI workflows carry an explicit least-privilege `permissions` block.
- [REQ-002] The build job runs on every Node major the package supports (20, 22, 24), not only the floor.
- [REQ-003] A lint gate (`npm run lint`) runs in CI alongside typecheck/test/build.
- [REQ-004] Config cross-references fail at parse time with the offender named: duplicate capability ids, a `defaultTarget` or capability `environment` naming no defined environment, and a capability persona naming no defined persona.
- [REQ-005] Write-back re-runs are idempotent at the GitHub layer: an existing head branch is re-pointed, an already-open pull request for the head is returned rather than failed, and comment listing paginates past one hundred.
- [REQ-006] Corpus verifier references are written with POSIX separators regardless of the authoring platform.

## Success Metrics

- The dogfood job's install line names a SHA; changing rac-core main does not
  change this repository's CI behavior until the pin is bumped.
- `npm run lint` exits 0 locally and in CI; a lint regression fails the build.
- A config with a typo'd environment name is rejected at parse with the
  capability and name in the error.
- Running the write-back twice for the same capability yields one branch and
  one pull request, updated in place.

## Risks

- A pinned rac can drift behind the contract. Mitigation: the pin is visible
  in the workflow with a comment saying when to bump; contract changes arrive
  as deliberate updates.
- Parse-time reference validation rejects configs that previously "worked" by
  fallback. Mitigation: the errors name the fix, and silent wrong-target runs
  were the worse failure.

## Assumptions

- GitHub's 422 messages for existing refs and pull requests keep containing
  "already exists" (the strings matched for idempotent handling).
- Biome's recommended rule set, with the two house-style exceptions recorded
  in `biome.json`, is a stable lint baseline.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `tests/scope-config.test.ts`
- `tests/github-rest-gateway.test.ts`
- `tests/writeback-proposer.test.ts`
- `tests/qa-command.test.ts`
