---
schema_version: 1
id: PK-KVZYXZ7S0YVE
type: design
---
# Config Scaffolding Command

## Context

PR-triggered QA needs a `proofkeeper.config.json`, authored by hand today. This design adds a
`proofkeeper init` command that generates a config skeleton from the coverage graph — the
in-scope MVP of Factory's `/install-qa`. It reads only the published Lore contract (the graph)
and never analyzes product source, so it stays squarely within Proofkeeper's verification
mandate.

## User Need

A team adopting Proofkeeper needs a running start: a config pre-populated with the project's
capabilities, which they then narrow (path globs) and enrich (auth, personas), rather than a
blank file.

## Design

- **Scaffolder (`scaffold.ts`):** `scaffoldConfig(graph, { url? })` is pure — it returns a
  `ProofkeeperConfig` with:
  - one capability per requirement node (`{ id, paths: ["src/**"], environment: "development" }`),
    unverified capabilities first;
  - a starter `environments.development` (the `--url` or `http://localhost:3000`),
    `defaultTarget`, and `failureLearning: "suggest_in_report"`.
  `renderScaffoldedConfig(config)` pretty-prints it as JSON.
- **Command (`cli.ts`):** `proofkeeper init (--graph-file | --corpus) [--url] [--out]`. Loads the
  graph, scaffolds, refuses to overwrite an existing `--out` (default `proofkeeper.config.json`),
  writes the JSON, and prints next-step guidance. Exit codes follow the stable contract (0 ok,
  2 usage / file-exists).

## Constraints

- Contract-only: reads `rac export --graph`; no product-source analysis (that is deferred and
  explicitly out of scope, keeping the command within the verification boundary).
- Never overwrites: writes only when the target path does not exist.
- The output parses with the existing `parseConfig` (placeholder globs included).

## Rationale

Scaffolding from the graph is deterministic and needs nothing but the contract Proofkeeper
already consumes, so it is the cleanest in-scope slice of `/install-qa`. Keeping `scaffoldConfig`
pure makes the generation unit-testable without the filesystem.

## Alternatives

- **Deep codebase analysis (Factory's phase 1).** Deferred: reading product source to infer
  apps/auth/flows is a larger capability that edges toward general code understanding; the
  graph-only scaffold is the safe, valuable MVP.
- **Interactive questionnaire.** Deferred: a non-interactive, deterministic scaffold fits the
  CLI-first contract and is scriptable.

## Accessibility

Not applicable — a CLI generator; output is plain JSON.

## Style Guidance

Pretty-print the JSON (2-space) and order keys for a readable starter file. Keep the printed
guidance short and actionable.

## Open Questions

- Whether to also generate a GitHub Actions workflow (Factory offers this). Deferred to a
  follow-up; this command scaffolds the config only.

## Related Requirements

- req-init-scaffold

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
