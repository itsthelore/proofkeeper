/**
 * PR-triggered QA — drive every unverified capability a change touched.
 *
 * Built on the Phase-1 {@link runQa} loop: scope the change to capabilities
 * ({@link scopeCapabilities}), then drive each one that still lacks a verifying
 * test, proposing a write-back when the capability declares its corpus artifact.
 * Runs sequentially so the shared compiler/runner output never collides. The
 * caller posts the summary to the feature pull request.
 */

import { runQa, type QaDeps, type QaResult } from "./run-qa.js";
import type { Graph } from "../coverage/graph.js";
import type { ProofkeeperConfig } from "../scope/config.js";
import { scopeCapabilities, type ScopedCapability, type ScopeResult } from "../scope/diff-scope.js";

export interface ScopedQaOptions {
  graph: Graph;
  config: ProofkeeperConfig;
  /** The files the pull request changed. */
  changedPaths: string[];
  /** Run-target name; each capability runs against its own start URL. */
  targetName: string;
  /** Start URL used when a capability config declares none. */
  defaultUrl?: string;
  /** Fidelity re-run count. */
  n: number;
  maxSteps?: number;
  /** When set, propose a write-back for capabilities that declare an `artifact`. */
  propose?: { baseBranch?: string };
}

export interface ScopedCapabilityResult {
  capability: ScopedCapability;
  /** Present when the capability was driven. */
  result?: QaResult;
  /** Present when the capability could not be driven (e.g. no start URL). */
  error?: string;
}

export interface ScopedQaResult {
  scope: ScopeResult;
  /** One entry per unverified scoped capability. */
  driven: ScopedCapabilityResult[];
}

export async function runScopedQa(deps: QaDeps, options: ScopedQaOptions): Promise<ScopedQaResult> {
  const scope = scopeCapabilities(options.changedPaths, options.config, options.graph);
  const driven: ScopedCapabilityResult[] = [];

  for (const cap of scope.toVerify) {
    const startUrl = cap.config.url ?? options.defaultUrl;
    if (startUrl === undefined) {
      driven.push({ capability: cap, error: "no start URL — set config.url or pass --url" });
      continue;
    }

    const propose =
      options.propose && cap.config.artifact !== undefined
        ? {
            targetPath: cap.config.artifact,
            ...(options.propose.baseBranch !== undefined ? { baseBranch: options.propose.baseBranch } : {}),
          }
        : undefined;

    const result = await runQa(deps, {
      graph: options.graph,
      capabilityId: cap.id,
      startUrl,
      ...(cap.config.goal !== undefined ? { goal: cap.config.goal } : {}),
      // Each capability runs against its own URL.
      target: { name: options.targetName, baseURL: startUrl },
      n: options.n,
      ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
      ...(propose ? { propose } : {}),
    });
    driven.push({ capability: cap, result });
  }

  return { scope, driven };
}
