# Changelog

User-visible changes to Proofkeeper, by release. Follows the spirit of
[Keep a Changelog](https://keepachangelog.com/): user impact over implementation
details, release history over commit history.

Releases use **CalVer** (`YYYY.MM.N`, ADR-076) and are cut as GitHub Releases
that publish `@itsthelore/proofkeeper` to npm with provenance. Author the
**zero-padded** form (e.g. `2026.06.4`) in `package.json` and the release tag,
consistent with the rest of itsthelore; the release workflow strips the month
padding to a valid npm version (`2026.6.4`) at publish, because npm's strict
SemVer forbids leading zeros. The release tag and `package.json` version must
match exactly, or the workflow fails the publish.

## Unreleased

The `v0.0.1` prototype, accumulated ahead of the first CalVer release:

- **Coverage read-model.** `proofkeeper coverage` reports which Lore capabilities
  have no verifying `verified_by` test, read deterministically from
  `rac export --graph`.
- **Autonomous drive, BYO-model.** An agent loop drives the product with a
  **browser, a terminal, and HTTP** (ADR-083, ADR-085), recording only what
  succeeds. No model is bundled; bring your own `ModelClient` (an optional Claude
  adapter ships in the box).
- **Session → test compiler + fidelity gate.** The recorded session compiles to a
  deterministic Playwright `.spec.ts`, kept only after N green re-runs.
- **`qa` / `verify` command** runs the whole loop behind one entry point, with a
  PR-triggered, diff-scoped mode that drives touched capabilities concurrently and
  posts the evidence as a single in-place pull-request comment.
- **`## Verified By` write-back** proposes linking a stable test to the capability
  it verifies through a human-reviewed pull request (ADR-065) — never a direct
  write.
- **`init` scaffolding, environments/auth, personas, and failure-learning** round
  out config-driven, PR-triggered QA.
- **Release automation.** A published GitHub Release builds, type-checks, tests,
  and publishes the package to npm with provenance.
