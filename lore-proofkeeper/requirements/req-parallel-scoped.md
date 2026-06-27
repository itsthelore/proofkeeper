---
schema_version: 1
id: PK-KVZWWJ3KMPQF
type: requirement
---
# Parallel, Context-Isolated Scoped QA

## Problem

PR-triggered QA drives the capabilities a change touches one after another. A pull request
touching several capabilities therefore takes the sum of their drive times, even though the
drives are independent. Ranger's published experience is that context-isolated, parallel QA
sub-agents are faster and more reliable than a single serial agent; scoped QA should do the
same. Naively parallelizing is unsafe today because the drives share a compiler output
directory and a runner output directory, so concurrent runs would clobber each other's
artifacts.

## Requirements

- [REQ-001] Scoped QA drives the touched, unverified capabilities concurrently, bounded by a configurable concurrency limit.
- [REQ-002] Each capability's drive, compilation, and run are isolated: a per-capability browser context, compiled-spec output directory, and runner output directory, so concurrent runs never clobber each other.
- [REQ-003] Results are returned in a deterministic order (the scoped order), independent of which capability finished first.
- [REQ-004] Total wall-clock for several touched capabilities approaches the slowest single capability rather than the sum.

## Success Metrics

- Driving N independent capabilities at concurrency C completes in roughly ceil(N/C) ×
  per-capability time, not N × per-capability time.
- No artifact collisions: each capability's spec and trace live under its own directory.

## Risks

- Parallel browser and runner processes contend for CPU and memory. Mitigation: a bounded
  concurrency pool with a conservative default.
- Shared mutable dependencies (a learning store, a proposer) race under concurrency.
  Mitigation: per-capability files and append-only proposals keep concurrent writes disjoint.

## Assumptions

- The drive seam launches an isolated browser context per call (the CLI already does).
- Per-capability output directories are derived deterministically from the capability id.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `tests/concurrency.test.ts`
- `tests/scoped-qa.test.ts`