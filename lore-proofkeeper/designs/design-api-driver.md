---
schema_version: 1
id: PK-KVZW3DQ1Y6VE
type: design
---
# HTTP/API Drive Modality

## Context

Proofkeeper's drive has two modalities — browser and terminal — each a set of tools that
record actions the deterministic emitter compiles into a Playwright spec. This design adds a
third, HTTP, mirroring the terminal modality's shape. It is gated on ADR-085, which records
the modality as an in-scope extension of ADR-083.

## User Need

A developer verifying an API-backed capability needs Proofkeeper to issue a request and
assert the response directly, producing a committed, re-runnable test — without driving a UI
or hand-rolling `curl`.

## Design

- **IR (`actions.ts`):** add `request` (method, url, headers?, body?), `expectStatus`
  (status), and `expectJson` (dot-path, scalar equals).
- **Shared helper (`http.ts`):** `httpRequest(input)` via global `fetch` returning
  `{ status, body }`, and `jsonPath(obj, path)`. The recorder uses these; the emitter inlines
  equivalents so record and replay agree.
- **Recorder:** `request()` issues and records, storing the last response; `expectStatus()` /
  `expectJson()` assert against it and record only if the assertion holds.
- **Emitter:** when a session uses HTTP, inline an `httpRequest` helper and a `jsonPath`
  helper plus a `let httpRes` holder; emit `httpRes = await httpRequest({…})`,
  `expect(httpRes.status).toBe(n)`, and `expect(jsonPath(JSON.parse(httpRes.body), path)).toBe(v)`.
- **Tools/drive:** add `request` / `expect_status` / `expect_json` to `DRIVE_TOOLS` with
  parsers and HTTP guidance; the drive dispatches them and feeds the response (status + body
  snippet) back to the model.

## Constraints

- Verification evidence only (ADR-083 Non-Goals / ADR-085): request and assert, never codegen
  or review.
- Deterministic emit: identical session → identical spec.
- No new dependency: global `fetch` (Node ≥ 20) in both recorder and emitted spec.
- Gated: not merged until ADR-085 is accepted.

## Rationale

Mirroring the terminal modality keeps one consistent evidence model (record → compile →
fidelity-gate) across browser, terminal, and HTTP. A shared `httpRequest`/`jsonPath` plus an
inlined copy guarantees record/replay parity, exactly as the terminal modality shares
`runCommand`.

## Alternatives

- **Reuse the terminal `curl`.** Rejected for ergonomics and determinism (text parsing of
  status/JSON); kept available as a fallback.
- **Full JSON-path / schema assertions.** Deferred: a dot-path equality plus a status
  assertion covers the common cases without a query-language dependency.

## Accessibility

Not applicable — a non-interactive drive modality; evidence renders as plain text in the PR.

## Style Guidance

Keep the HTTP tools and IR symmetric with the terminal modality's naming and structure, so
the recorder, emitter, and tool surface read consistently.

## Open Questions

- Whether to add header and full-body assertions later. Out of scope; status + JSON-field
  equality is the initial surface.

## Related Requirements

- req-api-driver

## Related Roadmaps

- post-droid-enhancements

## Status

Proposed
