---
schema_version: 1
id: PK-KVZW3D452WEJ
type: requirement
---
# HTTP/API Drive Modality

## Problem

Many product capabilities are service contracts, best verified by issuing an HTTP request
and asserting on the response rather than by driving a UI as a proxy. Proofkeeper drives a
browser and a terminal but has no first-class HTTP modality; verifying an API today means
constructing `curl` invocations through the terminal and parsing text, which is brittle for
status codes and JSON bodies. This modality is gated on the engine decision ADR-085, which
records that a first-class HTTP modality is an in-scope extension of ADR-083.

## Requirements

- [REQ-001] The drive offers HTTP tools: issue a request (method, URL, optional headers and body), assert the response status, and assert a field of a JSON response body.
- [REQ-002] HTTP assertions target the most recently issued request's response, and an assertion is recorded only if it holds at record time (the faithful-only discipline shared with the browser and terminal modalities).
- [REQ-003] A capability driven over HTTP compiles to a deterministic Playwright test that issues the request and asserts the response, runnable under the existing runner and fidelity gate.
- [REQ-004] The modality produces verification evidence only — request and assert — and never generates or reviews product code (ADR-083 Non-Goals, ADR-085).

## Success Metrics

- An API-only capability is driven, compiled, and passes a fidelity gate without any browser
  interaction beyond the seeded navigation.
- The emitted spec is deterministic: the same recorded session emits byte-identical code.

## Risks

- A first-class HTTP tool could drift toward general API automation. Mitigation: it is
  constrained to request-and-assert yielding a committed test, and ADR-085 records the
  boundary.
- JSON-path assertions over-fit a response shape. Mitigation: a simple dot-path equality
  assertion, with status assertion as the robust baseline.

## Assumptions

- The runtime provides a global `fetch` (Node ≥ 20), used by both the recorder and the
  emitted spec so record and replay agree.
- ADR-085 is accepted before this modality ships; until then the implementation is recorded
  but not merged.

## Related Roadmaps

- post-droid-enhancements
