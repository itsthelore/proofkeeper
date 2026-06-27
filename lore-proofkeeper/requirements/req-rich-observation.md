---
schema_version: 1
id: PK-KVZX780BG6Z8
type: requirement
---
# Richer Drive Observation

## Problem

Each turn, the drive hands the model a snapshot of the page: URL, title, visible text, and
the accessibility tree. It does not include the browser's execution feedback — console
messages and network responses. Playwright MCP feeds exactly this (console, network,
navigation) to the agent, and it matters: a failed request or a console error often explains
why an interaction did not take effect, and an API call the page made is signal for what to
assert. Without it the model wastes turns guessing at failures it cannot see.

## Requirements

- [REQ-001] The drive captures the page's console messages and network responses during a session and includes the most recent of each in the observation handed to the model.
- [REQ-002] Console and network capture is bounded to a recent window, so the observation stays within a reasonable size regardless of how chatty the page is.
- [REQ-003] The feedback is observation only — it informs the model's next action and is never recorded as a test action (it does not change what the compiled test asserts).
- [REQ-004] Capturing this feedback does not change the recorded session or the emitted test for a page that produces no console or network activity.

## Success Metrics

- The model's observation block includes recent console messages and network responses when
  the page produces them, visible in the recorded transcript.
- The observation size stays bounded on a page that logs or requests heavily.

## Risks

- A chatty page floods the observation. Mitigation: a bounded most-recent window.
- Event listeners leak across a long session. Mitigation: the monitor is disposed when the
  drive ends.

## Assumptions

- The Playwright page exposes console and response events (it does).
- Console/network feedback is advisory context; the committed test is governed by recorded
  actions and the fidelity gate.

## Related Roadmaps

- autonomous-qa-enhancements
