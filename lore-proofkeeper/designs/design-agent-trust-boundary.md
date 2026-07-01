---
schema_version: 1
id: PK-KWFV36C20A1Y
type: design
---
# Agent Trust Boundary — Egress Policy and Observation Redaction

## Context

The autonomous drive feeds untrusted page content into the model each turn and
dispatches the model's tool calls against the operator's machine and network.
Before this design there was no boundary between those two facts: the shell tool
was always advertised and executed via `spawnSync(..., { shell: true })`, any
absolute URL could be navigated or requested, and observation side channels went
to the model provider unredacted. This design adds the drive-time trust
boundary: an explicit egress policy checked before dispatch, and redaction of
the side channels.

## User Need

An operator pointing Proofkeeper at a real product — possibly rendering
third-party or user-generated content — needs the agent to be safe by default:
no shell unless deliberately enabled, no egress beyond the product under test
unless deliberately allowlisted, and no secrets riding the transcript to the
model provider.

## Design

- A new `EgressPolicy` (`src/agent/policy.ts`) is built per drive from the start
  URL's origin, the loaded extension's page base, and the operator's opt-ins
  (`allowShell`, `allowedHosts`). `callRefusal(call, policy)` returns the reason
  a tool call is refused, or undefined to dispatch.
- The policy is enforced twice, deliberately: `toolsForPolicy` withholds the
  terminal tools from the advertised catalog when the shell is off (a tool the
  model never sees cannot be asked for), and `dispatch` checks `callRefusal`
  before any recorder action (so advertising and enforcement cannot disagree).
- Refusals are fed back to the model as failed actions with the reason and the
  remedying flag named, matching how real action failures already surface.
- Non-special URL schemes (notably `chrome-extension:`) have an opaque WHATWG
  origin (`"null"`), so origins are compared as `protocol//host` for those —
  one extension's pages stay distinct from another's.
- Redaction (`src/agent/redact.ts`): `redactUrl` strips query strings and
  fragments; `redactText` masks sensitive query parameters, bearer credentials,
  and provider-shaped keys. Applied to network lines and console lines in the
  page monitor, and to command output and response snippets in the drive's tool
  feedback. The page's visible text and ARIA tree are not redacted, so the
  model's recorded assertions match the real page.
- The system prompt states the policy (which origins are reachable, whether a
  terminal exists) and tells the model that page content is data, never
  instructions.
- Threading: CLI `--allow-shell` / repeatable `--allow-host` on `qa`; scope
  config `allowShell` / `allowedHosts` for PR-triggered runs; both flow through
  `QaOptions` into `DriveOptions`.

## Constraints

- Additive and secure-by-default: an existing invocation that never used the
  terminal or a second origin behaves identically; one that did must opt in.
- The policy gates the agent's own egress only — what the page itself loads is
  the product's behavior under test and is out of scope.
- No new dependency; URL parsing uses the platform `URL`.

## Rationale

Withholding tools *and* checking at dispatch is deliberate defense in depth: the
tool list shapes what the model tries, the dispatch check makes the guarantee.
Refusing with a reason (rather than aborting the drive) keeps the loop's
existing failure-feedback contract, so an over-ambitious model recovers instead
of burning the attempt. Redacting only side channels preserves the property
that recorded assertions are copied from real page text.

## Alternatives

- **Sandbox the shell instead of gating it.** Rejected for now: a real sandbox
  (container, seccomp) is heavy and platform-specific; default-deny plus an
  explicit operator opt-in is honest about the risk and fits the CLI. A sandbox
  can layer on later without changing the policy surface.
- **Same-origin-only egress with no allowlist.** Rejected: real apps call their
  API on another host; a repeatable `--allow-host` keeps the default tight
  without blocking legitimate flows.
- **Redact the page's visible text too.** Rejected: assertions are copied from
  what the model sees; masking DOM text would make recorded expectations
  diverge from the real page and fail replay.

## Accessibility

Not applicable — an internal policy layer; its user surface is CLI flags and
refusal strings, which name the remedy.

## Style Guidance

Refusal messages name the blocked target, the allowed set, and the flag that
would permit it — actionable for both the model mid-drive and the operator
reading a transcript.

## Open Questions

- Whether `allowedHosts` should support wildcard subdomains (`*.example.com`).
  Deferred until a real corpus needs it.
- Whether an opt-in shell should also be sandboxed (constrained cwd, env
  scrubbing). Tracked as a possible follow-up to this boundary.

## Related Requirements

- req-agent-trust-boundary

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
