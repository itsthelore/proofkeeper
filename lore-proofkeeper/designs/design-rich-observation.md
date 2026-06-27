---
schema_version: 1
id: PK-KVZX78KQZEX9
type: design
---
# Richer Drive Observation

## Context

`observePage` returns a point-in-time DOM snapshot (URL, title, text, ARIA). Console messages
and network responses are *events* that accumulate over time, so they cannot be captured by a
snapshot. This design adds a small monitor that subscribes to those events during the drive
and feeds the most recent of each into the observation — the Playwright-MCP execution-feedback
context.

## User Need

The model needs to see *why* the page behaved as it did — a console error, a failed or
successful request — so it can choose a better next action and assert the right outcomes,
rather than guessing from the DOM alone.

## Design

- **`PageObservation`** gains optional `console?: string[]` and `network?: string[]`.
- **`createPageMonitor(page, { limit })`** subscribes to `page.on("console")` and
  `page.on("response")`, keeping bounded most-recent ring buffers (default 20):
  `[type] text` for console, `status method url` for network. It exposes the buffers and a
  `dispose()` that removes the listeners.
- **`observePage`** is unchanged (DOM snapshot only). The driver merges the monitor's buffers
  into the observation it renders each turn.
- **`renderObservation`** renders a "Console" and a "Network" block when those arrays are
  present and non-empty.
- **`AutonomousDriver`** creates a monitor after the initial navigation, includes its buffers
  in every observation, and disposes it when the drive ends.

## Constraints

- Observation only: console/network never become recorded actions; a page with no activity
  yields an identical session and emitted test to today.
- Bounded: a most-recent window keeps the observation size stable on chatty pages.
- No listener leak: the monitor is disposed at the end of the drive.

## Rationale

A subscribe-and-buffer monitor is the only way to surface events in a snapshot-shaped
observation. Keeping `observePage` a pure DOM snapshot and merging the buffers in the driver
keeps responsibilities clean and the function testable.

## Alternatives

- **Poll the page for console/network.** Not possible — these are push events; there is
  nothing to poll.
- **Record console/network as actions.** Rejected: they are advisory context, not assertions;
  recording them would change the test for no verification benefit.

## Accessibility

Not applicable — internal observation context, not a user surface.

## Style Guidance

Keep the monitor small and the rendered blocks short and labelled ("Console", "Network"),
consistent with the existing observation blocks.

## Open Questions

- Whether to also surface failed-request bodies. Deferred; status + URL is the initial signal.

## Related Requirements

- req-rich-observation

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
