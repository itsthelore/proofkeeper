/**
 * The drive's egress policy — the trust boundary between an untrusted page and
 * the tools the model holds.
 *
 * Everything the model reads during a drive (visible text, the ARIA tree,
 * console lines, network lines) comes from the product under test, and a page
 * can say anything — including instructions. The loop therefore treats the
 * model's tool calls as untrusted and checks them against an explicit policy
 * before dispatch:
 *
 * - The shell (`run_command`) is OFF by default; a caller opts in with
 *   `--allow-shell` / config `allowShell` when the capability genuinely needs a
 *   terminal.
 * - `navigate` and `request` may only touch the start URL's origin, plus hosts
 *   the caller allowlists (`--allow-host` / config `allowedHosts`), plus the
 *   loaded extension's own pages. Anything else — cloud metadata endpoints,
 *   internal services, arbitrary exfil targets — is refused, and the refusal is
 *   fed back to the model like any other failed action.
 *
 * The policy gates the agent's own egress; it does not (and cannot) restrict
 * what the page itself loads — that is the product's behavior under test.
 */

import type { ToolCall } from "./model.js";

/** The egress rules one drive runs under. Build with {@link buildPolicy}. */
export interface EgressPolicy {
  /** Whether the terminal tools are available at all. */
  allowShell: boolean;
  /** Origins (scheme://host[:port]) the drive may navigate/request. */
  allowedOrigins: string[];
  /** Extra hostnames the caller allowlisted (any scheme/port). */
  allowedHosts: string[];
}

/** Names of the terminal tools, withheld from the model unless the shell is allowed. */
export const SHELL_TOOL_NAMES: readonly string[] = ["run_command", "expect_output", "expect_exit"];

/**
 * A URL's comparable origin. WHATWG gives non-special schemes (notably
 * `chrome-extension:`) an opaque `"null"` origin, which would make every
 * opaque-origin URL compare equal — so those are rebuilt as `protocol//host`,
 * keeping one extension's pages distinct from another's.
 */
function originOf(parsed: URL): string {
  return parsed.origin !== "null" ? parsed.origin : `${parsed.protocol}//${parsed.host}`;
}

/**
 * Build the policy for one drive: the start URL's origin is always allowed, the
 * loaded extension's origin when present, plus any caller-allowlisted hosts.
 */
export function buildPolicy(input: {
  startUrl: string;
  allowShell?: boolean;
  allowedHosts?: string[];
  /** The loaded extension's page base (e.g. `chrome-extension://<id>/`), when present. */
  extensionBase?: string;
}): EgressPolicy {
  const origins: string[] = [];
  for (const candidate of [input.startUrl, input.extensionBase]) {
    if (candidate === undefined) continue;
    try {
      origins.push(originOf(new URL(candidate)));
    } catch {
      // An unparseable start URL fails at navigation, not here.
    }
  }
  return {
    allowShell: input.allowShell ?? false,
    allowedOrigins: origins,
    allowedHosts: input.allowedHosts ?? [],
  };
}

/**
 * Why a URL is refused under the policy, or undefined when it is allowed.
 *
 * A URL is allowed when its origin matches an allowed origin, or its hostname
 * matches an allowlisted host. Unparseable URLs are refused.
 */
export function urlRefusal(url: string, policy: EgressPolicy): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `'${url}' is not an absolute URL`;
  }
  const origin = originOf(parsed);
  if (policy.allowedOrigins.includes(origin)) return undefined;
  if (policy.allowedHosts.includes(parsed.hostname)) return undefined;
  return (
    `egress to ${origin} is not allowed — this drive may only reach ` +
    `${policy.allowedOrigins.join(", ") || "(no origins)"}` +
    (policy.allowedHosts.length > 0 ? ` and allowlisted hosts ${policy.allowedHosts.join(", ")}` : "") +
    ". Ask the operator to pass --allow-host if this host is genuinely needed."
  );
}

/**
 * Why a tool call is refused under the policy, or undefined when it may be
 * dispatched. This is the loop's pre-dispatch check; refusals are reported back
 * to the model as failed actions so it can adapt.
 */
export function callRefusal(call: ToolCall, policy: EgressPolicy): string | undefined {
  if (SHELL_TOOL_NAMES.includes(call.name) && !policy.allowShell) {
    return (
      "the shell is disabled for this drive (secure default). The operator can " +
      "enable it with --allow-shell / config allowShell when this capability needs a terminal."
    );
  }
  if (call.name === "navigate" || call.name === "request") {
    return urlRefusal(String(call.arguments["url"]), policy);
  }
  return undefined;
}
