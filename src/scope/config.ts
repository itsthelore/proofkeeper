/**
 * The Proofkeeper scope config — which capabilities a changed file touches.
 *
 * Modeled on Factory automated-qa's `path_patterns`: a config maps each
 * capability to the source-path globs whose change implies it should be
 * re-verified, plus optional drive overrides (start URL, goal) and the corpus
 * artifact to write `## Verified By` back to. It is the only place Proofkeeper
 * needs to know how product capabilities relate to source files.
 */

/** One capability's scoping entry. */
export interface CapabilityConfig {
  /** The requirement id (must be a capability node in the graph). */
  id: string;
  /** Source-path globs; a changed file matching any of these scopes this capability. */
  paths: string[];
  /** Optional start URL for the drive (else the command's `--url` default). */
  url?: string;
  /** Optional goal for the model (else derived from the capability). */
  goal?: string;
  /** Optional corpus artifact path to propose the write-back to. */
  artifact?: string;
}

export interface ProofkeeperConfig {
  capabilities: CapabilityConfig[];
}

/** Raised when the config is not a recognizable shape. */
export class ConfigParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigParseError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCapability(raw: unknown, index: number): CapabilityConfig {
  if (!isObject(raw)) throw new ConfigParseError(`capabilities[${index}] is not an object`);
  const id = raw["id"];
  if (typeof id !== "string" || id === "") {
    throw new ConfigParseError(`capabilities[${index}].id must be a non-empty string`);
  }
  const paths = raw["paths"];
  if (!Array.isArray(paths) || paths.length === 0 || !paths.every((p) => typeof p === "string")) {
    throw new ConfigParseError(`capabilities[${index}].paths must be a non-empty array of glob strings`);
  }
  const cap: CapabilityConfig = { id, paths: paths as string[] };
  if (typeof raw["url"] === "string") cap.url = raw["url"];
  if (typeof raw["goal"] === "string") cap.goal = raw["goal"];
  if (typeof raw["artifact"] === "string") cap.artifact = raw["artifact"];
  return cap;
}

/** Parse a Proofkeeper config from JSON. Strict on the shape scoping depends on. */
export function parseConfig(json: string): ProofkeeperConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new ConfigParseError(`config is not valid JSON: ${(err as Error).message}`);
  }
  if (!isObject(raw) || !Array.isArray(raw["capabilities"])) {
    throw new ConfigParseError("config must be an object with a `capabilities` array");
  }
  return { capabilities: raw["capabilities"].map(parseCapability) };
}
