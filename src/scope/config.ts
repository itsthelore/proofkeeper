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
  /** Optional start URL for the drive (overrides any environment). */
  url?: string;
  /** Optional named environment to target (else the config's default target). */
  environment?: string;
  /** Optional persona (role) to drive this capability as. */
  persona?: string;
  /** Optional goal for the model (else derived from the capability). */
  goal?: string;
  /** Optional corpus artifact path to propose the write-back to. */
  artifact?: string;
}

/** A user role the drive can act as. */
export interface PersonaConfig {
  name: string;
  /** Areas this role should focus on. */
  testFocus?: string[];
  /** Actions this role must not perform. */
  cannotDo?: string[];
}

/** A named environment the drive can target. */
export interface EnvironmentConfig {
  url: string;
  /** Human-readable directives the drive must respect (e.g. "read-only; never create data"). */
  restrictions?: string[];
  /** Unpacked browser-extension directory to load for the drive (extension verification). */
  extensionPath?: string;
}

/** How the product authenticates — described, never the credentials themselves. */
export interface AuthConfig {
  method: string;
  provider?: string;
}

/** How accumulated failure knowledge is surfaced (Factory automated-qa's `failure_learning`). */
export type FailureLearningStrategy = "suggest_in_report" | "auto_commit" | "open_a_pr";

const FAILURE_LEARNING_STRATEGIES: readonly FailureLearningStrategy[] = [
  "suggest_in_report",
  "auto_commit",
  "open_a_pr",
];

export interface ProofkeeperConfig {
  capabilities: CapabilityConfig[];
  /** Named environments (e.g. development, production). */
  environments?: Record<string, EnvironmentConfig>;
  /** The default environment name used when a capability names none. */
  defaultTarget?: string;
  /** How the product authenticates. */
  auth?: AuthConfig;
  /** User roles a capability can be driven as. */
  personas?: PersonaConfig[];
  /** How failure knowledge is surfaced. Defaults to `suggest_in_report`. */
  failureLearning?: FailureLearningStrategy;
  /**
   * Allow the drive's terminal tools. OFF by default: enabling an unsandboxed
   * shell is an explicit operator decision (the drive's trust boundary).
   */
  allowShell?: boolean;
  /** Extra hostnames drives may navigate/request beyond each target's origin. */
  allowedHosts?: string[];
}

/** A capability's resolved run target. */
export interface ResolvedTarget {
  name: string;
  url: string;
  restrictions: string[];
  /** Unpacked extension dir for the drive, when the target declares one. */
  extensionPath?: string;
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
  if (typeof raw["environment"] === "string") cap.environment = raw["environment"];
  if (typeof raw["persona"] === "string") cap.persona = raw["persona"];
  if (typeof raw["goal"] === "string") cap.goal = raw["goal"];
  if (typeof raw["artifact"] === "string") cap.artifact = raw["artifact"];
  return cap;
}

function stringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new ConfigParseError(`${where} must be an array of strings`);
  }
  return value as string[];
}

function parsePersonas(raw: unknown): PersonaConfig[] {
  if (!Array.isArray(raw)) throw new ConfigParseError("`personas` must be an array");
  return raw.map((value, index) => {
    if (!isObject(value) || typeof value["name"] !== "string" || value["name"] === "") {
      throw new ConfigParseError(`personas[${index}].name must be a non-empty string`);
    }
    const persona: PersonaConfig = { name: value["name"] };
    if (value["testFocus"] !== undefined) persona.testFocus = stringArray(value["testFocus"], `personas[${index}].testFocus`);
    if (value["cannotDo"] !== undefined) persona.cannotDo = stringArray(value["cannotDo"], `personas[${index}].cannotDo`);
    return persona;
  });
}

function parseEnvironments(raw: unknown): Record<string, EnvironmentConfig> {
  if (!isObject(raw)) throw new ConfigParseError("`environments` must be an object");
  const out: Record<string, EnvironmentConfig> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!isObject(value) || typeof value["url"] !== "string") {
      throw new ConfigParseError(`environment '${name}' must have a string url`);
    }
    const env: EnvironmentConfig = { url: value["url"] };
    const restrictions = value["restrictions"];
    if (restrictions !== undefined) {
      if (!Array.isArray(restrictions) || !restrictions.every((r) => typeof r === "string")) {
        throw new ConfigParseError(`environment '${name}'.restrictions must be an array of strings`);
      }
      env.restrictions = restrictions as string[];
    }
    const extensionPath = value["extensionPath"];
    if (extensionPath !== undefined) {
      if (typeof extensionPath !== "string" || extensionPath === "") {
        throw new ConfigParseError(`environment '${name}'.extensionPath must be a non-empty string`);
      }
      env.extensionPath = extensionPath;
    }
    out[name] = env;
  }
  return out;
}

function parseAuth(raw: unknown): AuthConfig {
  if (!isObject(raw) || typeof raw["method"] !== "string") {
    throw new ConfigParseError("`auth` must have a string method");
  }
  const auth: AuthConfig = { method: raw["method"] };
  if (typeof raw["provider"] === "string") auth.provider = raw["provider"];
  return auth;
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
  const config: ProofkeeperConfig = { capabilities: raw["capabilities"].map(parseCapability) };
  if (raw["environments"] !== undefined) config.environments = parseEnvironments(raw["environments"]);
  if (typeof raw["defaultTarget"] === "string") config.defaultTarget = raw["defaultTarget"];
  if (raw["auth"] !== undefined) config.auth = parseAuth(raw["auth"]);
  if (raw["personas"] !== undefined) config.personas = parsePersonas(raw["personas"]);
  if (raw["allowShell"] !== undefined) {
    if (typeof raw["allowShell"] !== "boolean") {
      throw new ConfigParseError("`allowShell` must be a boolean");
    }
    config.allowShell = raw["allowShell"];
  }
  if (raw["allowedHosts"] !== undefined) {
    config.allowedHosts = stringArray(raw["allowedHosts"], "`allowedHosts`");
  }
  config.failureLearning =
    raw["failureLearning"] !== undefined ? parseFailureLearning(raw["failureLearning"]) : "suggest_in_report";
  validateReferences(config);
  return config;
}

/**
 * Cross-reference validation: a typo'd environment or persona name must fail
 * at parse time with the artifact named, not silently fall back to a default
 * URL (or fail mid-drive) at run time.
 */
function validateReferences(config: ProofkeeperConfig): void {
  const seen = new Set<string>();
  for (const cap of config.capabilities) {
    if (seen.has(cap.id)) {
      throw new ConfigParseError(
        `duplicate capability id '${cap.id}' — each capability must appear once`,
      );
    }
    seen.add(cap.id);
  }

  const environments = config.environments ?? {};
  if (config.defaultTarget !== undefined && environments[config.defaultTarget] === undefined) {
    throw new ConfigParseError(
      `defaultTarget '${config.defaultTarget}' is not a defined environment`,
    );
  }
  const personas = new Set((config.personas ?? []).map((p) => p.name));
  for (const cap of config.capabilities) {
    if (cap.environment !== undefined && environments[cap.environment] === undefined) {
      throw new ConfigParseError(
        `capability '${cap.id}' references undefined environment '${cap.environment}'`,
      );
    }
    if (cap.persona !== undefined && !personas.has(cap.persona)) {
      throw new ConfigParseError(
        `capability '${cap.id}' references undefined persona '${cap.persona}'`,
      );
    }
  }
}

function parseFailureLearning(raw: unknown): FailureLearningStrategy {
  if (typeof raw !== "string" || !FAILURE_LEARNING_STRATEGIES.includes(raw as FailureLearningStrategy)) {
    throw new ConfigParseError(`failureLearning must be one of: ${FAILURE_LEARNING_STRATEGIES.join(", ")}`);
  }
  return raw as FailureLearningStrategy;
}

/**
 * Goal context for a capability's selected persona, or undefined when it names
 * none. Throws when the named persona is not defined in the config.
 */
export function personaContext(config: ProofkeeperConfig, cap: CapabilityConfig): string | undefined {
  if (cap.persona === undefined) return undefined;
  const persona = config.personas?.find((p) => p.name === cap.persona);
  if (!persona) throw new ConfigParseError(`capability '${cap.id}' references undefined persona '${cap.persona}'`);
  const parts = [`Act as the ${persona.name} persona.`];
  if (persona.testFocus && persona.testFocus.length > 0) parts.push(`Focus on: ${persona.testFocus.join(", ")}.`);
  if (persona.cannotDo && persona.cannotDo.length > 0) parts.push(`Do not: ${persona.cannotDo.join(", ")}.`);
  return parts.join(" ");
}

/**
 * Resolve a capability's run target: an explicit `cap.url` wins; otherwise the
 * environment named by `cap.environment ?? config.defaultTarget`; otherwise the
 * caller's fallback URL. Returns undefined when no URL can be determined.
 */
export function resolveTarget(
  config: ProofkeeperConfig,
  cap: CapabilityConfig,
  opts: { fallbackUrl?: string; defaultName: string },
): ResolvedTarget | undefined {
  if (cap.url !== undefined) {
    return { name: opts.defaultName, url: cap.url, restrictions: [] };
  }
  const envName = cap.environment ?? config.defaultTarget;
  const env = envName !== undefined ? config.environments?.[envName] : undefined;
  if (env) {
    return {
      name: envName!,
      url: env.url,
      restrictions: env.restrictions ?? [],
      ...(env.extensionPath !== undefined ? { extensionPath: env.extensionPath } : {}),
    };
  }
  if (opts.fallbackUrl !== undefined) {
    return { name: opts.defaultName, url: opts.fallbackUrl, restrictions: [] };
  }
  return undefined;
}

/** A one-line auth context for the drive goal, or undefined when no auth is configured. */
export function authContext(config: ProofkeeperConfig): string | undefined {
  if (!config.auth) return undefined;
  return `Authentication: ${config.auth.method}${config.auth.provider ? ` via ${config.auth.provider}` : ""}.`;
}
