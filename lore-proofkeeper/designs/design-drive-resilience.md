---
schema_version: 1
id: PK-KWFWJNJ7NHN4
type: design
---
# Drive Resilience — Bounded Time, Isolated Failure, Visible Cost

## Context

A review found the pipeline had no wall-clock bounds anywhere (`grep` for
timeout/retry found only the extension loader), all-or-nothing failure in the
scoped pool and the fidelity gate, unbounded transcript growth, and zero cost
or audit visibility. This design adds the resilience layer without changing
any verdict semantics.

## User Need

An operator running Proofkeeper unattended — in CI or over a large scoped
change — needs the run to always terminate, to lose only the failing
capability when something breaks, and to be able to see afterwards what the
agent did and what it cost.

## Design

- **Time-box every external await.** The drive wraps `model.complete` in a
  timeout (default 2 min, `modelTimeoutMs`) with one backed-off retry
  (`modelRetryBackoffMs`, default 2 s); `runCommand` gains
  `timeout`/`maxBuffer` (2 min / 16 MB), mirrored in the emitted spec's inline
  helper so record and replay stay in agreement; the Playwright invocation
  (10 min, `timeoutMs` option), the rac export (2 min), and the git diff
  (1 min) get `execFile` timeouts.
- **Failure is local.** The fidelity gate wraps each attempt: a runner
  exception is a failed attempt recorded on `FidelityVerdict.errors`, so "the
  test failed" and "the run broke" are distinguishable and the gate always
  completes. The scoped pool wraps the whole per-capability `runQa` in
  try/catch, filling the existing `ScopedCapabilityResult.error` seam instead
  of rejecting the pool.
- **Bounded observation.** `renderObservation` clips text and ARIA blocks at
  8,000 chars each with an explicit `[truncated N chars]` marker; console and
  network windows were already bounded.
- **Visible cost and conduct.** `ModelResponse.usage` (adapter-mapped from
  both providers) accumulates into `DriveResult.tokens`, rendered in the QA
  summary. `DriveOptions.onStep` emits a per-turn audit event (tool calls,
  outcomes, model latency); the CLI's `--verbose` writes it to stderr as it
  happens.

## Constraints

- No verdict semantics change: stable still means N green attempts; an errored
  attempt is simply a failed one with a reason.
- Additive public surface only (`usage`, `tokens`, `errors`, `onStep`,
  timeout options); every existing caller compiles unchanged.
- The emitted spec's helper must match `runCommand` byte-for-byte in
  behavior — the two are changed together.

## Rationale

Timeouts belong at each shell-out/await site (the only places a hang can
start), not in a global watchdog that would kill work it cannot attribute.
Retrying exactly once catches the dominant transient-blip case without hiding
a dead provider. Filling the pool's existing `error` field keeps the scoped
result shape stable for the PR-comment renderer.

## Alternatives

- **AbortController threaded through ModelClient.** Deferred: it changes the
  BYO-model interface every custom adapter implements; a race-based timeout
  unblocks the loop today and a signal can be added additively later.
- **A global drive watchdog.** Rejected: coarser than per-site caps and it
  cannot say *what* hung.
- **Configurable observation budget.** Deferred until a real page needs it;
  the marker makes truncation visible when it happens.

## Accessibility

Not applicable — timeouts and logging; the `--verbose` stream is plain text.

## Style Guidance

Timeout errors name the cap that fired ("model call timed out after 120000ms")
and retry errors name both failures, so a transcript reads as a diagnosis.

## Open Questions

- Whether a spend ceiling (`--max-tokens-budget`) should abort a drive
  mid-run. Usage is now measured, which is the prerequisite.

## Related Requirements

- req-drive-resilience

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
