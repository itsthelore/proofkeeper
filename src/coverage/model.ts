/**
 * The coverage read-model — Proofkeeper Initiative 1.
 *
 * Pure functions over a parsed {@link Graph}: no I/O, no browser, no model.
 * The signal is exact and deterministic (ADR-084): a *capability* is a
 * requirement node, and it is *verified* iff some `verified_by` edge has it as
 * source. Because `verified_by` targets are external test/trace paths, those
 * edges always carry `resolved: false` and a literal target — which is the
 * reference we surface, not a corpus id.
 */

import { VERIFIED_BY, type Graph, type GraphNode } from "./graph.js";

/** The artifact type whose nodes are product capabilities (ADR-020). */
export const CAPABILITY_TYPE = "requirement";

/** A capability with the (external) references that verify it, if any. */
export interface CapabilityCoverage {
  id: string;
  title: string;
  status: string;
  /** Literal `verified_by` targets (test/trace paths). Empty ⇒ unverified. */
  verifiedBy: string[];
}

/** The whole-corpus coverage answer to "what is unverified?". */
export interface CoverageReport {
  source: string;
  total: number;
  verified: CapabilityCoverage[];
  unverified: CapabilityCoverage[];
}

function isCapability(node: GraphNode): boolean {
  return node.type === CAPABILITY_TYPE;
}

/**
 * Compute verification coverage over a graph export.
 *
 * Capabilities are sorted by id for deterministic output (the engine already
 * emits sorted nodes, but we do not depend on that).
 */
export function computeCoverage(graph: Graph): CoverageReport {
  // Map each capability id to its external verifier references.
  const verifiersById = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (isCapability(node)) {
      verifiersById.set(node.id, []);
    }
  }
  for (const edge of graph.edges) {
    if (edge.type !== VERIFIED_BY) continue;
    const targets = verifiersById.get(edge.source);
    // Only count edges originating at a known capability node.
    if (targets) targets.push(edge.target);
  }

  const capabilities = graph.nodes
    .filter(isCapability)
    .map<CapabilityCoverage>((node) => ({
      id: node.id,
      title: node.title,
      status: node.status,
      verifiedBy: verifiersById.get(node.id) ?? [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const verified = capabilities.filter((c) => c.verifiedBy.length > 0);
  const unverified = capabilities.filter((c) => c.verifiedBy.length === 0);

  return {
    source: graph.source,
    total: capabilities.length,
    verified,
    unverified,
  };
}
