---
schema_version: 1
id: PK-KVZWWJQ3YX1Y
type: design
---
# Parallel, Context-Isolated Scoped QA

## Context

`runScopedQa` drives each touched, unverified capability sequentially through `runQa`,
sharing one compiler and one runner. To parallelize safely, each capability needs its own
isolated output, and the shared runner/compiler must become per-capability. This design adds
a bounded concurrency pool and per-capability isolation (Ranger's context-isolated sub-agent
lesson).

## User Need

A reviewer waiting on PR-triggered QA needs results quickly. When a change touches several
capabilities, they should be verified in parallel rather than one at a time.

## Design

- **Concurrency helper (`concurrency.ts`):** `mapPool(items, limit, fn)` runs `fn` over the
  items with at most `limit` in flight and returns results in input order (deterministic).
- **Per-capability deps:** `runScopedQa` takes a `ScopedQaDeps` whose `makeCompiler(id)` and
  `makeRunner(id)` mint per-capability instances, instead of a single shared compiler/runner.
  The drive seam already isolates the browser context per call.
- **Isolation:** the CLI's factories create a `CodegenCompiler` with `outDir <out>/<id>` and a
  `PlaywrightRunner` with `outputDir test-results/<id>`, so concurrent specs and traces never
  collide.
- **Ordering:** `mapPool` writes each result into its input index, so `driven` stays in the
  scoped order regardless of completion order.
- **Control:** `ScopedQaOptions.concurrency` (default a small constant); the `qa --config`
  command gains `--concurrency`.

## Constraints

- Deterministic result order despite parallel execution.
- A conservative default concurrency to bound browser/runner resource use.
- Per-capability files keep the shared learning store and proposer writes disjoint.

## Rationale

A small index-preserving pool is enough — no dependency on a worker library. Making the
compiler/runner per-capability via factories localizes isolation to one seam without
threading output directories through `runQa`.

## Alternatives

- **Keep one runner, isolate inside it.** Rejected: a single `PlaywrightRunner` has one
  output directory; concurrent `playwright test` processes would clobber it.
- **Unbounded `Promise.all`.** Rejected: N concurrent browsers exhausts resources; a bounded
  pool is safer.

## Accessibility

Not applicable — an execution-concurrency change with no user-facing surface beyond a flag.

## Style Guidance

Keep the pool helper tiny and dependency-free; keep `makeCompiler`/`makeRunner` factory names
symmetric.

## Open Questions

- Whether to auto-tune concurrency to CPU count. Deferred; a fixed default with a flag is the
  initial surface.

## Related Requirements

- req-parallel-scoped

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
