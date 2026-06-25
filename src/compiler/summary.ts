/**
 * Render a recorded session into readable steps — the human-facing companion to
 * the compiled spec. Where the emitter produces code for the machine to re-run,
 * {@link summarizeSession} produces prose for a reviewer to read in the pull
 * request: "Navigate to …", "Click the button 'Verify'", "Run `npm test`",
 * "Expect the last command to exit 0". Pure: it reads the same {@link Action} IR.
 */

import type { Action, Locator, RecordedSession } from "./actions.js";

function locatorLabel(loc: Locator): string {
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
      return `Click ${locatorLabel(action.locator)}`;
    case "fill":
      return `Fill ${locatorLabel(action.locator)} with "${action.value}"`;
    case "check":
      return `Check ${locatorLabel(action.locator)}`;
    case "press":
      return `Press ${action.key} on ${locatorLabel(action.locator)}`;
    case "expectText":
      return `Expect ${locatorLabel(action.locator)} to read "${action.text}"`;
    case "expectVisible":
      return `Expect ${locatorLabel(action.locator)} to be visible`;
    case "run":
      return `Run \`${action.command}\``;
    case "expectOutput":
      return `Expect the last command's ${action.stream} to ${action.match} "${action.value}"`;
    case "expectExit":
      return `Expect the last command to exit ${action.code}`;
    case "request":
      return `Request ${action.method} ${action.url}`;
    case "expectStatus":
      return `Expect HTTP status ${action.status}`;
    case "expectJson":
      return `Expect JSON ${action.path} to equal ${JSON.stringify(action.equals)}`;
  }
}

/** One readable line per recorded action, in order. */
export function summarizeSession(session: RecordedSession): string[] {
  return session.actions.map(describeAction);
}
