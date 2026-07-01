---
schema_version: 1
id: PK-KWFX3KXWBRKD
type: design
---
# Delivery Hygiene — Pinning, Permissions, Lint, and Idempotent Re-Runs

## Context

The final batch of a four-part review response: the first three hardened the
agent loop and its verdicts; this one hardens how Proofkeeper itself is built,
checked, and re-run. Everything here is process and edge hardening — no drive
or verdict semantics change.

## User Need

A maintainer must be able to trust that CI results are reproducible (not a
function of another repository's default branch), that the published package
works on the Node versions users actually run, that re-running a write-back
cannot fail or spam, and that a config typo is caught before a drive targets
the wrong URL.

## Design

- **Supply chain.** `dogfood.yml` installs rac-core at a commit SHA with a
  comment stating the bump policy; both CI workflows gain
  `permissions: contents: read`.
- **Matrix + lint.** The build job fans out over Node 20/22/24 and gains a
  `npm run lint` step. Lint is Biome (single pinned dev dependency,
  lint-only — the formatter stays off). Two recommended rules are disabled as
  deliberate house style: bracket access on `Record<string, unknown>`
  (`useLiteralKeys`) and post-validation non-null assertions
  (`noNonNullAssertion`); `useTemplate` is off to avoid churn. The remaining
  recommended set is enforced at zero diagnostics.
- **Config cross-validation.** `parseConfig` ends with a `validateReferences`
  pass: duplicate capability ids, unknown `defaultTarget`, unknown capability
  `environment`, and unknown `persona` references all raise `ConfigParseError`
  naming the offender. `resolveTarget`'s fallback remains for
  programmatically built configs, but a parsed config can no longer reach it
  with a typo.
- **Idempotent GitHub layer.** `createBranch` catches the 422 "already
  exists" and force-updates the existing head ref to the fresh base;
  `openPullRequest` catches the 422 and returns the already-open pull request
  for that head; `listComments` pages until a short page. All three keep
  their error behavior for every other failure.
- **Portable references.** `linksFromResults` POSIX-normalizes spec and trace
  paths before they become corpus `## Verified By` content.
- `parseCoverageArgs` uses the same `requireValue` guard as every other
  parser.

## Constraints

- The lint baseline must hold at zero diagnostics — rules are configured off
  explicitly rather than tolerated as warnings.
- Idempotency handling matches on GitHub's documented 422 semantics only;
  unknown errors still throw.
- No behavior change for configs and write-backs that were already
  well-formed.

## Rationale

Pinning by SHA (not tag) makes the dogfood gate exactly reproducible and
makes adopting a new contract an explicit, reviewable diff. Biome over
ESLint: one pinned binary, no plugin graph — a smaller supply-chain surface in
the same PR that pins the other one. Parse-time reference validation follows
the engine's own philosophy: refuse with a named offender rather than degrade
silently.

## Alternatives

- **Renovate/Dependabot-style automated pin bumps.** Deferred: process
  machinery beyond this change's scope; the manual bump comment suffices at
  current cadence.
- **ESLint + typescript-eslint.** Rejected for now: larger dependency
  surface; the strict tsconfig already covers most type-adjacent rules.
- **Deleting stale head branches instead of re-pointing.** Rejected:
  re-pointing preserves an open pull request and its review thread.

## Accessibility

Not applicable — CI configuration and internal validation; user surface is
error text that names the fix.

## Style Guidance

Validation errors name the artifact and the offending reference
("capability 'A' references undefined environment 'prod'") so the fix needs no
searching.

## Open Questions

- Whether the dogfood pin should move to a rac-core release tag once CalVer
  releases are cut there regularly.

## Related Requirements

- req-delivery-hygiene

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
