/**
 * The `rac export --graph` contract, as Proofkeeper consumes it.
 *
 * This mirrors the engine's published shape (rac-core `services/export.py`,
 * ADR-074): a single whole-graph JSON object of typed nodes and edges. We
 * model only what the coverage read-model needs and treat everything else as
 * additive — unknown fields are ignored, never required — so the engine can
 * grow the contract without breaking us (ADR-007, JSON contract stability).
 *
 * We are a contract consumer (ADR-063, ADR-083): this file parses the
 * published JSON. It never reaches into the engine's internals.
 */

/** The edge kind Proofkeeper's coverage signal keys on (ADR-084). */
export const VERIFIED_BY = "verified_by";

/** A classified corpus artifact. Capabilities are nodes of type `requirement`. */
export interface GraphNode {
  id: string;
  type: string;
  status: string;
  title: string;
}

/**
 * One typed relationship edge. `verified_by` is directed (capability → test)
 * and external-target, so it is always emitted with `resolved: false` and the
 * literal test/trace reference as `target` (ADR-084).
 */
export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  directed: boolean;
  resolved: boolean;
}

/** The whole-graph projection emitted by `rac export --graph`. */
export interface Graph {
  schema_version: string;
  source: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Raised when input is not a recognizable graph export. Maps to exit code 2. */
export class GraphParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphParseError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, where: string): string {
  if (typeof value !== "string") {
    throw new GraphParseError(`expected a string at ${where}, got ${typeof value}`);
  }
  return value;
}

function parseNode(raw: unknown, index: number): GraphNode {
  if (!isObject(raw)) {
    throw new GraphParseError(`nodes[${index}] is not an object`);
  }
  return {
    id: asString(raw["id"], `nodes[${index}].id`),
    type: asString(raw["type"], `nodes[${index}].type`),
    status: asString(raw["status"], `nodes[${index}].status`),
    title: asString(raw["title"], `nodes[${index}].title`),
  };
}

function parseEdge(raw: unknown, index: number): GraphEdge {
  if (!isObject(raw)) {
    throw new GraphParseError(`edges[${index}] is not an object`);
  }
  return {
    source: asString(raw["source"], `edges[${index}].source`),
    target: asString(raw["target"], `edges[${index}].target`),
    type: asString(raw["type"], `edges[${index}].type`),
    directed: Boolean(raw["directed"]),
    resolved: Boolean(raw["resolved"]),
  };
}

/**
 * Parse a `rac export --graph` JSON string into a typed {@link Graph}.
 *
 * Strict about the shape the coverage model depends on (nodes/edges arrays and
 * their required string fields), tolerant of additive fields the engine may
 * introduce later.
 *
 * @throws {GraphParseError} when the input is not a recognizable graph export.
 */
export function parseGraph(json: string): Graph {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new GraphParseError(`input is not valid JSON: ${(err as Error).message}`);
  }
  if (!isObject(raw)) {
    throw new GraphParseError("graph export must be a JSON object");
  }
  if (!Array.isArray(raw["nodes"])) {
    throw new GraphParseError("graph export is missing a `nodes` array");
  }
  if (!Array.isArray(raw["edges"])) {
    throw new GraphParseError("graph export is missing an `edges` array");
  }
  return {
    schema_version: typeof raw["schema_version"] === "string" ? raw["schema_version"] : "",
    source: typeof raw["source"] === "string" ? raw["source"] : "",
    nodes: raw["nodes"].map(parseNode),
    edges: raw["edges"].map(parseEdge),
  };
}
