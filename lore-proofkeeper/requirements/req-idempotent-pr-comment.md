---
schema_version: 1
id: PK-KVZTZ97T6FZH
type: requirement
---
# Idempotent Pull-Request QA Comment

## Problem

Proofkeeper posts its scoped-QA evidence and write-back confirmations as pull-request
comments. Today each run posts a *new* comment, so a pull request that is pushed to
repeatedly accretes a thread of near-duplicate QA comments. Reviewers lose the signal:
they cannot tell which comment reflects the current head, and the thread becomes noise.
The surveyed autonomous-QA tools (notably Factory DROID) instead keep exactly one QA
comment per pull request that updates in place.

## Requirements

- [REQ-001] For a given pull request and comment kind, Proofkeeper maintains exactly one comment: the first run creates it and every subsequent run updates that same comment in place rather than posting a new one.
- [REQ-002] A Proofkeeper comment is identified by a stable, machine-readable marker embedded in its body, distinct per comment kind (scoped-QA status versus write-back confirmation), so the correct comment is found and updated.
- [REQ-003] Comment identification keys only on the marker and never depends on parsing human-readable prose.
- [REQ-004] The behaviour is exposed through the injected repository gateway, so it stays backend-agnostic and adds no hard GitHub dependency.

## Success Metrics

- A pull request shows exactly one Proofkeeper QA comment of each kind regardless of how
  many times the run fires against it.
- Re-running QA on the same pull request updates the existing comment's body and timestamp,
  and creates no additional comments.

## Risks

- A marker collision or a gateway that cannot list comments would cause a new comment to be
  created instead of an update. Mitigation: a specific, namespaced marker and a gateway
  contract that lists comments before deciding create-vs-update.
- Comment edit history is mutated rather than appended. Accepted: the current head's status
  is the useful signal; prior states live in the pull request's commit and check history.

## Assumptions

- The repository gateway can list a pull request's comments and update a comment by id
  (the GitHub REST API supports both).
- Human pull-request review remains the trust boundary; the comment is informational and
  never approves or merges.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `tests/writeback-comment.test.ts`
- `tests/github-rest-gateway.test.ts`