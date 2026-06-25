/**
 * Human-readable summary of a recorded drive session — Proofkeeper Initiative 5.
 *
 * Renders the recorded {@link Action} IR as plain, reviewer-facing step lines so
 * a verification pull request explains what was exercised without anyone opening
 * the trace (the "verify by reading the PR" payoff). Pure and deterministic.
 */

import type { Action, Locator, RecordedSession } from "./actions.js";

function describeLocator(loc: Locator): string {
  switch (loc.kind) {
    case "role":
      return loc.name !== undefined ? `the ${loc.role} "${loc.name}"` : `the ${loc.role}`;
    case "testId":
      return `[${loc.testId}]`;
    case "text":
      return `"${loc.text}"`;
    case "label":
      return `the "${loc.label}" field`;
    case "css":
      return `\`${loc.selector}\``;
  }
}

function describeAction(action: Action): string {
  switch (action.type) {
    case "goto":
      return `Navigate to ${action.url}`;
    case "click":
      return `Click ${describeLocator(action.locator)}`;
    case "fill":
      return `Fill ${describeLocator(action.locator)} with "${action.value}"`;
    case "check":
      return `Check ${describeLocator(action.locator)}`;
    case "press":
      return `Press ${action.key} on ${describeLocator(action.locator)}`;
    case "expectText":
      return `Expect ${describeLocator(action.locator)} to read "${action.text}"`;
    case "expectVisible":
      return `Expect ${describeLocator(action.locator)} to be visible`;
  }
}

/** Render a recorded session as numbered, reviewer-facing step lines. */
export function summarizeSession(session: RecordedSession): string[] {
  return session.actions.map((action, index) => `${index + 1}. ${describeAction(action)}`);
}
