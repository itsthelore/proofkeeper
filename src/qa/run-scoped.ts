/**
 * PR-triggered QA — drive every unverified capability a change touched.
 *
 * Built on the Phase-1 {@link runQa} loop: scope the change to capabilities
 * ({@link scopeCapabilities}), then drive each one that still lacks a verifying
 * test, proposing a write-back when the capability declares its corpus artifact.
 * Capabilities are driven **concurrently** with a bounded pool, each isolated in
 * its own browser context, compiler output directory, and runner output
 * directory (Ranger's context-isolated sub-agent lesson). Results stay in scoped
 * order. The caller posts the summary to the feature pull request.
 */

import { runQa, type QaDeps, type QaResult } from "./run-qa.js";
import { mapPool } from "./concurrency.js";
import type { Graph } from "../coverage/graph.js";
import type { Compiler } from "../compiler/types.js";
import type { Runner } from "../runner/types.js";
import type { WriteBackProposer } from "../writeback/proposer.js";
import type { LearningStore } from "../learning/store.js";
import { resolveTarget, authContext, personaContext, type ProofkeeperConfig } from "../scope/config.js";
import { scopeCapabilities, type ScopedCapability, type ScopeResult } from "../scope/diff-scope.js";

/** Default capabilities driven at once — conservative to bound browser/runner load. */
export const DEFAULT_SCOPED_CONCURRENCY = 3;

/**
 * Dependencies for scoped QA. The compiler and runner are minted **per
 * capability** so concurrent drives write to isolated directories; the drive
 * seam already isolates the browser context per call.
 */
export interface ScopedQaDeps {
  drive: QaDeps["drive"];
  /** Mint a compiler whose output directory is isolated to this capability. */
  makeCompiler(capabilityId: string): Compiler;
  /** Mint a runner whose output directory is isolated to this capability. */
  makeRunner(capabilityId: string): Runner;
  proposer?: WriteBackProposer;
  learning?: LearningStore;
}

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
  /** When set, the drive emits a Markdown test plan before acting. */
  plan?: boolean;
  /** Max capabilities driven at once. Defaults to {@link DEFAULT_SCOPED_CONCURRENCY}. */
  concurrency?: number;
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
  /** One entry per unverified scoped capability, in scoped order. */
  driven: ScopedCapabilityResult[];
}

/** A capability's recorded failure reasons, for the suggest-in-report strategy. */
export interface FailureSuggestion {
  id: string;
  title: string;
  reasons: string[];
}

/**
 * Collect recorded failure reasons for each driven capability that failed or
 * could not be driven, from the learning store — the `suggest_in_report`
 * failure-learning strategy's source. Pure over the store (no drive).
 */
export async function collectFailureSuggestions(
  result: ScopedQaResult,
  learning: LearningStore,
): Promise<FailureSuggestion[]> {
  const suggestions: FailureSuggestion[] = [];
  for (const driven of result.driven) {
    const failed = driven.error !== undefined || driven.result?.verified === false;
    if (!failed) continue;
    const prior = await learning.priorFailures(driven.capability.id);
    if (prior.length > 0) {
      suggestions.push({ id: driven.capability.id, title: driven.capability.title, reasons: prior.map((f) => f.reason) });
    }
  }
  return suggestions;
}

export async function runScopedQa(deps: ScopedQaDeps, options: ScopedQaOptions): Promise<ScopedQaResult> {
  const scope = scopeCapabilities(options.changedPaths, options.config, options.graph);

  const driven = await mapPool(
    scope.toVerify,
    options.concurrency ?? DEFAULT_SCOPED_CONCURRENCY,
    async (cap): Promise<ScopedCapabilityResult> => {
      // Resolve the target: explicit url, else a named environment, else the default.
      const target = resolveTarget(options.config, cap.config, {
        ...(options.defaultUrl !== undefined ? { fallbackUrl: options.defaultUrl } : {}),
        defaultName: options.targetName,
      });
      if (target === undefined) {
        return { capability: cap, error: "no start URL — set config.url, an environment, or pass --url" };
      }

      // Thread persona, environment restrictions, and auth context into the goal.
      const contextParts: string[] = [];
      let persona: string | undefined;
      try {
        persona = personaContext(options.config, cap.config);
      } catch (err) {
        return { capability: cap, error: (err as Error).message };
      }
      if (persona) contextParts.push(persona);
      if (target.restrictions.length > 0) {
        contextParts.push(`Environment restrictions: ${target.restrictions.join("; ")}. Respect them strictly.`);
      }
      const auth = authContext(options.config);
      if (auth) contextParts.push(auth);
      const goalContext = contextParts.length > 0 ? contextParts.join(" ") : undefined;

      const propose =
        options.propose && cap.config.artifact !== undefined
          ? {
              targetPath: cap.config.artifact,
              ...(options.propose.baseBranch !== undefined ? { baseBranch: options.propose.baseBranch } : {}),
            }
          : undefined;

      // Per-capability isolated compiler + runner; the drive seam isolates the browser.
      const capDeps: QaDeps = {
        drive: deps.drive,
        compiler: deps.makeCompiler(cap.id),
        runner: deps.makeRunner(cap.id),
        ...(deps.proposer ? { proposer: deps.proposer } : {}),
        ...(deps.learning ? { learning: deps.learning } : {}),
      };

      const result = await runQa(capDeps, {
        graph: options.graph,
        capabilityId: cap.id,
        startUrl: target.url,
        ...(cap.config.goal !== undefined ? { goal: cap.config.goal } : {}),
        ...(goalContext !== undefined ? { goalContext } : {}),
        // Each capability runs against its resolved environment URL.
        target: { name: target.name, baseURL: target.url },
        n: options.n,
        ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
        ...(options.plan ? { plan: true } : {}),
        ...(target.extensionPath !== undefined ? { extensionPath: target.extensionPath } : {}),
        ...(propose ? { propose } : {}),
      });
      return { capability: cap, result };
    },
  );

  return { scope, driven };
}
