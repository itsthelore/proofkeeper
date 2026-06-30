---
schema_version: 1
id: PK-KWBH4HMAVW38
type: design
---
# Self-Verification Coverage Gate

## Context

Proofkeeper records its own capabilities in `lore-proofkeeper/` and proves them with `## Verified By` links, but the dogfood report was never enforced. This design makes "Proofkeeper's corpus stays fully verified" a required CI gate, using Proofkeeper's own coverage command, and surfaces it as a README badge.

## User Need

A maintainer (and a reader evaluating the project) needs confidence that Proofkeeper actually practises what it sells — that every capability it claims is backed by a test — without manually running coverage and without trusting an advisory number that can silently drift.

## Design

- A dedicated workflow `.github/workflows/dogfood.yml`, named so its status badge reads as the dogfood signal. On push and pull request it:
  - checks out the repo, sets up Node, `npm ci`, `npm run build`;
  - sets up Python and installs the `rac` engine from the rac-core repository (`pip install "git+https://github.com/itsthelore/rac-core.git"`), which provides the `rac` command;
  - runs `node dist/cli.js coverage --corpus lore-proofkeeper/`. The command exits non-zero if any capability is unverified, so the job fails on drift with no extra scripting.
- The README adds a badge pointing at this workflow's status on the default branch (a shields.io GitHub-Actions badge with a `dogfooding` label), next to the existing CI and npm badges.
- This requirement is itself verified by the workflow file, keeping the corpus self-consistent (every capability, including this one, has a `## Verified By`).

## Constraints

- Reuse the published behaviour: the gate runs the real `coverage` CLI and the real `rac export` contract path, not a bespoke checker (ADR-063, ADR-083).
- No engine import: `rac` is installed as an external CLI; Proofkeeper consumes its JSON output only.
- Determinism over snapshots: export the corpus live rather than committing a graph file that could drift from the artifacts.

## Rationale

Enforcing the existing coverage command is the smallest change that turns an advisory signal into a guarantee, and it dogfoods the product end to end — Proofkeeper verifies itself exactly as a consumer would. A workflow-status badge is honest because it reflects a real run, not a hand-set value.

## Alternatives

- **Commit a `rac export --graph` snapshot and check against it.** Rejected: the snapshot drifts from the artifacts and would need its own freshness gate.
- **A custom script that parses the corpus directly.** Rejected: it would bypass the very CLI and contract path the product ships, weakening the dogfood.
- **A manually maintained "passing" badge.** Rejected: not tied to a real result; can lie.

## Accessibility

The badge carries descriptive alt text; status is conveyed by text ("passing"/"failing"), not colour alone.

## Style Guidance

Match the existing workflow conventions in `.github/workflows/ci.yml` (Node 20, `npm ci`, named jobs) and place the badge alongside the current badge row.

## Open Questions

- Whether to pin the rac-core install to a released tag for extra determinism once a stable cadence exists. Deferred; track via the schema_version guard for now.

## Related Requirements

- req-dogfood-coverage-gate

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
