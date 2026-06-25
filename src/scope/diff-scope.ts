/**
 * Scope verification to a change — Proofkeeper's PR-triggered QA.
 *
 * Given the files a pull request changed, the scope config, and the coverage
 * graph, decide which capabilities the change touches and which of those still
 * lack a verifying test. Pure: no git, no I/O. The CLI supplies the changed
 * paths (from `--changed` or a `git diff`); this decides what to drive.
 */

import { computeCoverage } from "../coverage/model.js";
import type { Graph } from "../coverage/graph.js";
import type { CapabilityConfig, ProofkeeperConfig } from "./config.js";
import { matchesAnyGlob } from "./glob.js";

/** A capability the change touched, with how it matched and its verified state. */
export interface ScopedCapability {
  id: string;
  title: string;
  config: CapabilityConfig;
  /** True when the graph already has a verifying test for it. */
  verified: boolean;
  /** The changed paths that matched this capability's globs. */
  matchedPaths: string[];
}

export interface ScopeResult {
  /** Capabilities whose source paths intersect the diff. */
  scoped: ScopedCapability[];
  /** The subset of `scoped` that is currently unverified — the drive targets. */
  toVerify: ScopedCapability[];
  /** Config ids that matched the diff but are not capability nodes in the graph. */
  unknown: string[];
}

/** Decide which capabilities a set of changed paths touches, and which need verifying. */
export function scopeCapabilities(
  changedPaths: string[],
  config: ProofkeeperConfig,
  graph: Graph,
): ScopeResult {
  const report = computeCoverage(graph);
  const titleById = new Map<string, string>();
  const verifiedIds = new Set<string>();
  for (const c of report.verified) {
    titleById.set(c.id, c.title);
    verifiedIds.add(c.id);
  }
  for (const c of report.unverified) titleById.set(c.id, c.title);

  const scoped: ScopedCapability[] = [];
  const unknown: string[] = [];

  for (const cap of config.capabilities) {
    const matchedPaths = changedPaths.filter((p) => matchesAnyGlob(p, cap.paths));
    if (matchedPaths.length === 0) continue;
    if (!titleById.has(cap.id)) {
      unknown.push(cap.id);
      continue;
    }
    scoped.push({
      id: cap.id,
      title: titleById.get(cap.id)!,
      config: cap,
      verified: verifiedIds.has(cap.id),
      matchedPaths,
    });
  }

  return { scoped, toVerify: scoped.filter((s) => !s.verified), unknown };
}
