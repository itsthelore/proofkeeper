/**
 * The recorded-action IR — the source of truth the session→test compiler
 * compiles from (Proofkeeper Initiative 2, the moat).
 *
 * A drive session is captured as an ordered, typed {@link Action} list with
 * Playwright-codegen-style {@link Locator} strategies. This IR is deliberately
 * small, explicit, and serializable: the compiler reduces it to a `.spec.ts`
 * deterministically, and the recorder only appends an action *after* it
 * succeeded against a real page — so a recorded trace is, by construction, a
 * sequence that held at least once.
 */

/** How to find an element, preferring resilient codegen-style strategies. */
export type Locator =
  | { kind: "role"; role: string; name?: string }
  | { kind: "testId"; testId: string }
  | { kind: "text"; text: string }
  | { kind: "label"; label: string }
  | { kind: "css"; selector: string };

/**
 * One recorded interaction or assertion. Browser actions drive a page; terminal
 * actions (`run`, `expectOutput`, `expectExit`) drive a shell — the second of
 * the "browser and a terminal" tools (ADR-083). A session may interleave both.
 */
export type Action =
  // Browser actions.
  | { type: "goto"; url: string }
  | { type: "click"; locator: Locator }
  | { type: "fill"; locator: Locator; value: string }
  | { type: "check"; locator: Locator }
  | { type: "press"; locator: Locator; key: string }
  | { type: "expectText"; locator: Locator; text: string }
  | { type: "expectVisible"; locator: Locator }
  // Terminal actions. Assertions target the most recently run command's result.
  | { type: "run"; command: string; cwd?: string }
  | { type: "expectOutput"; match: "exact" | "contains" | "regex"; stream: "stdout" | "stderr"; value: string }
  | { type: "expectExit"; code: number }
  // HTTP actions. Assertions target the most recently issued request's response.
  | { type: "request"; method: string; url: string; headers?: Record<string, string>; body?: string }
  | { type: "expectStatus"; status: number }
  | { type: "expectJson"; path: string; equals: string | number | boolean };

/** The action types that assert an observable outcome. */
const ASSERTION_TYPES: readonly Action["type"][] = [
  "expectText",
  "expectVisible",
  "expectOutput",
  "expectExit",
  "expectStatus",
  "expectJson",
];

/**
 * Whether a session asserted at least one observable outcome. A session of
 * bare navigation/clicks compiles to a trivially-green spec that verifies
 * nothing — callers use this to refuse to call such a session "verified".
 */
export function sessionAssertsOutcome(session: RecordedSession): boolean {
  return session.actions.some((a) => ASSERTION_TYPES.includes(a.type));
}

/** A captured drive session: its entry point and the actions recorded from it. */
export interface RecordedSession {
  /** The capability this session exercises (threads to the write-back). */
  capabilityId?: string;
  /** Human title for the emitted test. */
  title: string;
  /** Product entry point the session started from. */
  startUrl: string;
  /**
   * Unpacked browser-extension directory loaded for the drive, when verifying an
   * extension. Set ⇒ the emitter produces a persistent-context spec that re-loads
   * the extension and rediscovers its (non-deterministic) ID at run time.
   */
  extensionPath?: string;
  /** The recorded actions, in order. */
  actions: Action[];
  /**
   * Optional human-readable Markdown test plan the model emitted before driving
   * (metadata, not compiled into the spec; surfaced in the write-back).
   */
  plan?: string;
}
