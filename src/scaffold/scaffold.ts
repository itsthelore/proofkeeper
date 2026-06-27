/**
 * Config scaffolding — the in-scope MVP of Factory's `/install-qa`. Generates a
 * `proofkeeper.config.json` skeleton from the published Lore graph (`rac export
 * --graph`), the contract Proofkeeper already consumes. It reads only that
 * contract — never product source — so it stays within the verification mandate.
 * The user then narrows each capability's path globs and adds auth/personas.
 */

import { computeCoverage } from "../coverage/model.js";
import type { Graph } from "../coverage/graph.js";
import type { CapabilityConfig, ProofkeeperConfig } from "../scope/config.js";

export interface ScaffoldOptions {
  /** Development environment URL. Defaults to http://localhost:3000. */
  url?: string;
}

/**
 * Generate a config skeleton from the graph: one capability per requirement node
 * (unverified first), plus a starter environment, default target, and
 * failure-learning strategy. Pure and deterministic.
 */
export function scaffoldConfig(graph: Graph, options: ScaffoldOptions = {}): ProofkeeperConfig {
  const report = computeCoverage(graph);
  // Unverified capabilities first — those most in need of a verifying test.
  const ordered = [...report.unverified, ...report.verified];
  const capabilities: CapabilityConfig[] = ordered.map((c) => ({
    id: c.id,
    paths: ["src/**"],
    environment: "development",
  }));
  return {
    environments: { development: { url: options.url ?? "http://localhost:3000" } },
    defaultTarget: "development",
    failureLearning: "suggest_in_report",
    capabilities,
  };
}

/** Pretty-print a scaffolded config as JSON (trailing newline). */
export function renderScaffoldedConfig(config: ProofkeeperConfig): string {
  return JSON.stringify(config, null, 2) + "\n";
}
