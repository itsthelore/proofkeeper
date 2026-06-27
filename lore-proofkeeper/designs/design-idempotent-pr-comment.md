---
schema_version: 1
id: PK-KVZTZ9VHPT1E
type: design
---
# Idempotent Pull-Request QA Comment

## Context

Proofkeeper's scoped-QA run and write-back proposer post pull-request comments through an
injected `RepoGateway`. The gateway exposes only `commentOnPullRequest` (create), so every
run appends a new comment. This design adds find-or-update ("upsert") so a pull request
carries one canonical comment per kind that updates in place.

## User Need

A reviewer reading a pull request needs a single, current QA verdict — not a growing stack
of near-duplicate comments from repeated pushes. They need to glance at one comment and
trust it reflects the latest head.

## Design

- Extend `RepoGateway` with two reads/writes: `listComments(prNumber)` and
  `updateComment(commentId, body)`.
- Add `upsertComment(prNumber, marker, body)`: list the pull request's comments, find the
  one whose body contains `marker`, and update it; if none exists, create one (body still
  carries the marker).
- Embed a stable hidden marker as an HTML comment at the top of each rendered body — e.g.
  `<!-- proofkeeper:scoped-qa -->` and `<!-- proofkeeper:write-back -->` — one per comment
  kind. Markers are constants beside the renderers in `comment.ts`.
- Route the scoped-QA status comment and the write-back confirmation comment through
  `upsertComment`. `GitHubRestGateway` implements `listComments` (GET issue comments) and
  `updateComment` (PATCH issue comment).

## Constraints

- Backend-agnostic: all new behaviour is on the `RepoGateway` interface; no hard GitHub
  dependency (the REST gateway is one implementation).
- The trust boundary is unchanged (ADR-065): the comment is informational and never
  approves or merges.
- Markers must be invisible in rendered Markdown (HTML comments) and namespaced to avoid
  matching unrelated comments.

## Rationale

A hidden marker keyed lookup is deterministic and prose-independent, so reformatting the
comment never breaks identification. Putting upsert on the gateway keeps the renderers pure
string builders and leaves persistence to the adapter — consistent with the existing
write-back design.

## Alternatives

- **Store the comment id in repo state or a branch.** Rejected: adds state Proofkeeper must
  own and keep in sync; the marker makes the comment self-identifying.
- **Delete-and-recreate each run.** Rejected: loses the stable comment URL and churns
  notifications.

## Accessibility

The comment is plain GitHub-flavoured Markdown; the marker is an HTML comment invisible to
readers and screen readers. Status is conveyed by text (stable / unstable / error), not by
colour or emoji alone.

## Style Guidance

Keep one heading and a compact body so the in-place update reads cleanly on every push.
Reuse the existing scoped-QA and write-back comment renderers; the marker is prepended, not
woven into prose.

## Open Questions

- None blocking. A future refinement could collapse multiple comment kinds into one
  combined comment if reviewers prefer a single status block.

## Related Requirements

- req-idempotent-pr-comment

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
