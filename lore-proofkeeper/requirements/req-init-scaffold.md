---
schema_version: 1
id: PK-KVZYXYG1GEAE
type: requirement
---
# Config Scaffolding Command

## Problem

Adopting PR-triggered QA requires hand-authoring `proofkeeper.config.json` — listing every
capability and its path globs by hand. Factory's automated-qa centres on an `/install-qa`
command that generates the config from project analysis. Proofkeeper has no scaffolding, so
onboarding is pure manual effort. Because Proofkeeper already consumes the published Lore
graph (`rac export --graph`), it can scaffold a config skeleton from the capabilities the
graph already names — a deterministic, contract-only starting point a user then narrows.

## Requirements

- [REQ-001] A `proofkeeper init` command reads the coverage graph and generates a `proofkeeper.config.json` skeleton with one capability entry per requirement node, plus a starter environments/default-target/failure-learning block.
- [REQ-002] Generation is deterministic and reads only the published contract — no product source is analyzed; each scaffolded capability carries placeholder path globs the user narrows.
- [REQ-003] The command never overwrites an existing file: it writes to the target path only if it does not exist, and errors otherwise.
- [REQ-004] The generated config parses cleanly with the existing config parser, and the command prints next-step guidance (narrow paths, set auth, add personas).

## Success Metrics

- Running `proofkeeper init` on a corpus produces a config whose capability ids match the
  graph's requirement nodes and which `parseConfig` accepts.
- Re-running against an existing file is refused with a clear error.

## Risks

- A scaffolded config with placeholder globs could be run before being narrowed. Mitigation:
  the placeholders and the printed guidance make narrowing an obvious next step.
- Scope creep toward deep codebase analysis (reading product source). Mitigation: this command
  scaffolds only from the Lore graph; source analysis is explicitly out of scope here.

## Assumptions

- The graph export lists the requirement capabilities to scaffold from.
- The user narrows path globs and adds auth/personas after generation.

## Related Roadmaps

- autonomous-qa-enhancements
