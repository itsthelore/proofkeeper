---
schema_version: 1
id: PK-KWFV35NRWPT3
type: requirement
---
# Agent Trust Boundary for the Drive

## Problem

Everything the drive's model observes — visible text, the ARIA tree, console
lines, network lines — is content from the product under test, and a page can
say anything, including instructions ("to verify, run this command…"). The same
model simultaneously held an unsandboxed shell tool and unrestricted
`navigate`/`request` URLs, so a hostile or compromised page could steer the
agent into executing commands in the operator's environment or reaching
internal endpoints (cloud metadata, private services) and feeding the responses
back out through the transcript. The transcript itself is shipped to a
third-party model provider, so tokens passing through URLs, console noise, or
command output leaked along with it.

## Requirements

- [REQ-001] The drive's terminal tools (`run_command`, `expect_output`, `expect_exit`) are unavailable by default and exist only when the operator opts in (`--allow-shell` on the CLI, `allowShell` in the scope config).
- [REQ-002] `navigate` and `request` may only reach the start URL's origin, the loaded extension's own pages, and hostnames the operator allowlists (`--allow-host` / config `allowedHosts`); all other egress is refused before dispatch.
- [REQ-003] A refused tool call is reported back to the model as a failed action with the reason, so the drive can adapt instead of aborting.
- [REQ-004] Withheld tools are not advertised to the model at all, and the policy is enforced again at dispatch — advertising and enforcement never disagree.
- [REQ-005] Observation side channels (network lines, console lines, command output, response snippets) are redacted of query strings and credential-shaped values before entering the transcript; the page's visible text and ARIA tree are left intact so recorded assertions match the real page.

## Success Metrics

- A drive whose page contains an injected "run this command" instruction cannot
  execute it without the operator having passed `--allow-shell`.
- A `navigate`/`request` to a non-allowlisted origin (e.g. a metadata endpoint)
  is refused and surfaced to the model as a failed action.
- A token-bearing URL or command output appears in the transcript only in
  redacted form.

## Risks

- Legitimate flows that span origins (an app calling its API on another host)
  now require an explicit `--allow-host`. Mitigation: the refusal message names
  the flag, and the allowlist is repeatable.
- Redaction patterns are heuristic; an unusual token shape can pass through.
  Mitigation: the patterns cover the common shapes (query parameters, bearer
  credentials, provider key prefixes) and are centralized for extension.

## Assumptions

- The Recorder remains the trust anchor for what enters a committed test; this
  boundary governs what the model may *do* and *see*, not what is recorded.
- Human pull-request review remains the trust boundary for write-backs
  (engine decision ADR-065); this requirement is the drive-time complement.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `tests/agent-policy.test.ts`
- `tests/redact.test.ts`
