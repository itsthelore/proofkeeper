#!/usr/bin/env node
/**
 * The `proofkeeper` CLI.
 *
 * - `coverage` exposes the coverage read-model (Initiative 1).
 * - `qa` (alias `verify`) runs the full QA loop for one capability: select →
 *   drive → compile → fidelity → run → (optional) propose the write-back.
 *
 * Exit codes are a stable contract: 0 = success (every capability verified, or
 * the driven capability passed the fidelity gate), 1 = not verified (unverified
 * capabilities, or an unstable test), 2 = usage/parse error.
 */

import { computeCoverage } from "./coverage/model.js";
import { renderHuman, renderJson } from "./coverage/report.js";
import { GraphParseError } from "./coverage/graph.js";
import { loadGraphFromCorpus, loadGraphFromFile } from "./coverage/source.js";
import { runQa, type QaDeps, type QaOptions } from "./qa/run-qa.js";
import { runScopedQa, collectFailureSuggestions, type ScopedQaDeps, type ScopedQaResult, type FailureSuggestion } from "./qa/run-scoped.js";
import { parseConfig, ConfigParseError } from "./scope/config.js";
import { AutonomousDriver, type DriveOptions, type DriveResult } from "./agent/drive.js";
import type { ModelClient } from "./agent/model.js";
import { ClaudeModelClient } from "./agent/adapters/claude.js";
import { CodegenCompiler } from "./compiler/compiler.js";
import { FileLearningStore } from "./learning/store.js";
import { PlaywrightRunner } from "./runner/playwright-runner.js";
import type { RunTarget } from "./runner/types.js";
import { GitHubRestGateway } from "./writeback/gateways/github-rest.js";
import { GitHubWriteBackProposer, type WriteBackProposer } from "./writeback/proposer.js";
import { renderScopedQaComment, upsertComment, SCOPED_QA_MARKER, type ScopedQaCommentInput, type ScopedQaCommentRow } from "./writeback/comment.js";
import { scaffoldConfig, renderScaffoldedConfig } from "./scaffold/scaffold.js";

import { execFile } from "node:child_process";
import { readFile, writeFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EXIT_OK = 0;
const EXIT_UNVERIFIED = 1;
const EXIT_USAGE = 2;

const USAGE = `proofkeeper — autonomous verification for the Lore family

Usage:
  proofkeeper coverage (--graph-file <path> | --corpus <dir>) [--json]
  proofkeeper init (--graph-file <path> | --corpus <dir>) [--url <url>] [--out <path>]
  proofkeeper qa (--graph-file <path> | --corpus <dir>) --url <url> [options]
  proofkeeper qa (--graph-file <path> | --corpus <dir>) --config <path>
                 (--changed <files> | --base-ref <ref>) [options]
  proofkeeper --help

Commands:
  coverage    Report which Lore capabilities have no verifying (verified_by) test.
  init        Scaffold a proofkeeper.config.json from the coverage graph: one
              capability per requirement node, plus a starter environment block.
              Reads only the published Lore contract; never overwrites a file.
  qa          Drive one capability, compile a test, gate it on fidelity, and
              (optionally) propose the Verified By write-back. Alias: verify.
              With --config, scope to a change: drive every unverified capability
              the changed files touch and post the evidence to a pull request.

Coverage options:
  --graph-file <path>   Read a 'rac export --graph' JSON file (primary).
  --corpus <dir>        Shell out to 'rac export --graph <dir>' (requires rac on PATH).
  --json                Emit the stable machine-readable contract.

init options:
  --graph-file <path>   | --corpus <dir>   Coverage source (one required).
  --url <url>           Development environment URL (default: http://localhost:3000).
  --out <path>          Where to write the config (default: proofkeeper.config.json).
                        Refuses to overwrite an existing file.

qa options:
  --graph-file <path>   | --corpus <dir>   Coverage source (one required).
  --url <url>           Product entry point the drive starts from (required).
  --capability <id>     Verify this capability (default: the first unverified).
  --goal <text>         Goal for the model (default: derived from the capability).
  --target-name <name>  Run target name (default: local).
  --base-url <url>      Base URL the compiled test runs against (default: --url).
  --n <count>           Fidelity re-runs the test must pass (default: 3).
  --max-steps <count>   Cap on model turns during the drive.
  --out-dir <dir>       Where the compiled .spec.ts is written (default: tests/generated).
  --plan                Emit a Markdown test plan before driving; show it in the PR.
  --propose             Propose a Verified By write-back PR when the test is stable.
  --target-path <path>  Artifact to write back to (required with --propose).
  --repo <owner/name>   Target repository for the write-back (required with --propose).
  --base <branch>       Base branch the write-back PR targets (default: main).

scoped qa options (with --config):
  --config <path>       Path map: which capabilities each changed file touches.
  --changed <a,b,c>     Comma-separated changed files (else --base-ref).
  --base-ref <ref>      Diff against this git ref to find changed files.
  --concurrency <n>     Capabilities driven at once (default: 3).
  --url <url>           Default start URL when a config capability declares none.
  --propose             Propose a write-back for capabilities that declare an artifact.
  --repo <owner/name>   Repository for write-backs and the PR comment.
  --pr <number>         Post the scoped-QA evidence comment on this pull request.

Model: qa uses the bundled Claude adapter when ANTHROPIC_API_KEY is set. Bring a
different provider by calling runQa() from the library with your own ModelClient.
Write-back: --propose needs a GitHub token in GITHUB_TOKEN.

Options:
  --help, -h            Show this help.
  --version, -v         Print the version.

Exit codes:
  0  success (everything verified, or the driven test is stable)
  1  not verified (unverified capabilities, or an unstable test)
  2  usage or parse error
`;

class UsageError extends Error {}

// ---------------------------------------------------------------------------
// coverage
// ---------------------------------------------------------------------------

interface CoverageArgs {
  graphFile?: string;
  corpus?: string;
  json: boolean;
}

function parseCoverageArgs(argv: string[]): CoverageArgs {
  const args: CoverageArgs = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--graph-file":
        args.graphFile = argv[++i];
        break;
      case "--corpus":
        args.corpus = argv[++i];
        break;
      case "--json":
        args.json = true;
        break;
      default:
        throw new UsageError(`unknown option '${arg}'`);
    }
  }
  if (!args.graphFile && !args.corpus) {
    throw new UsageError("coverage requires --graph-file <path> or --corpus <dir>");
  }
  if (args.graphFile && args.corpus) {
    throw new UsageError("pass only one of --graph-file or --corpus");
  }
  if ((args.graphFile !== undefined && !args.graphFile) || (args.corpus !== undefined && !args.corpus)) {
    throw new UsageError("missing value for --graph-file/--corpus");
  }
  return args;
}

async function runCoverage(argv: string[]): Promise<number> {
  const args = parseCoverageArgs(argv);
  const graph = args.graphFile
    ? await loadGraphFromFile(args.graphFile)
    : await loadGraphFromCorpus(args.corpus!);

  const report = computeCoverage(graph);
  process.stdout.write((args.json ? renderJson(report) : renderHuman(report)) + "\n");
  return report.unverified.length > 0 ? EXIT_UNVERIFIED : EXIT_OK;
}

// ---------------------------------------------------------------------------
// init — scaffold a config from the coverage graph
// ---------------------------------------------------------------------------

export interface InitArgs {
  graphFile?: string;
  corpus?: string;
  url?: string;
  out: string;
}

const DEFAULT_CONFIG_PATH = "proofkeeper.config.json";

/** Parse `init` arguments. Pure and exported so it is unit-testable. */
export function parseInitArgs(argv: string[]): InitArgs {
  const raw: Partial<InitArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--graph-file":
        raw.graphFile = requireValue(argv[++i], "--graph-file");
        break;
      case "--corpus":
        raw.corpus = requireValue(argv[++i], "--corpus");
        break;
      case "--url":
        raw.url = requireValue(argv[++i], "--url");
        break;
      case "--out":
        raw.out = requireValue(argv[++i], "--out");
        break;
      default:
        throw new UsageError(`unknown option '${arg}'`);
    }
  }

  if (!raw.graphFile && !raw.corpus) {
    throw new UsageError("init requires --graph-file <path> or --corpus <dir>");
  }
  if (raw.graphFile && raw.corpus) {
    throw new UsageError("pass only one of --graph-file or --corpus");
  }

  return {
    ...(raw.graphFile !== undefined ? { graphFile: raw.graphFile } : {}),
    ...(raw.corpus !== undefined ? { corpus: raw.corpus } : {}),
    ...(raw.url !== undefined ? { url: raw.url } : {}),
    out: raw.out ?? DEFAULT_CONFIG_PATH,
  };
}

/** True when a path already exists on disk. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runInit(argv: string[]): Promise<number> {
  const args = parseInitArgs(argv);
  const graph = args.graphFile
    ? await loadGraphFromFile(args.graphFile)
    : await loadGraphFromCorpus(args.corpus!);

  // Never overwrite: refuse before generating so the user's file is untouched.
  if (await pathExists(args.out)) {
    throw new UsageError(`'${args.out}' already exists — remove it or pass --out <path> to write elsewhere`);
  }

  const config = scaffoldConfig(graph, { ...(args.url !== undefined ? { url: args.url } : {}) });
  await writeFile(args.out, renderScaffoldedConfig(config), "utf8");

  const count = config.capabilities.length;
  process.stdout.write(
    `Wrote ${args.out} with ${count} capabilit${count === 1 ? "y" : "ies"} from the coverage graph.\n` +
      "Next steps:\n" +
      "  - Narrow each capability's path globs from 'src/**' to the files it owns.\n" +
      "  - Set your environment URLs and, if the product needs sign-in, an auth block.\n" +
      "  - Add personas for role-specific flows.\n",
  );
  return EXIT_OK;
}

// ---------------------------------------------------------------------------
// qa / verify
// ---------------------------------------------------------------------------

export interface QaArgs {
  graphFile?: string;
  corpus?: string;
  capability?: string;
  url: string;
  goal?: string;
  targetName: string;
  baseUrl: string;
  n: number;
  maxSteps?: number;
  outDir: string;
  plan: boolean;
  propose: boolean;
  targetPath?: string;
  base?: string;
  repo?: string;
}

function requireValue(value: string | undefined, flag: string): string {
  if (value === undefined || value === "") throw new UsageError(`missing value for ${flag}`);
  return value;
}

function parsePositiveInt(value: string | undefined, flag: string): number {
  const n = Number(requireValue(value, flag));
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`${flag} must be a positive integer`);
  return n;
}

/** Parse `qa`/`verify` arguments. Pure and exported so it is unit-testable. */
export function parseQaArgs(argv: string[]): QaArgs {
  const raw: Partial<QaArgs> = { propose: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--graph-file":
        raw.graphFile = requireValue(argv[++i], "--graph-file");
        break;
      case "--corpus":
        raw.corpus = requireValue(argv[++i], "--corpus");
        break;
      case "--capability":
        raw.capability = requireValue(argv[++i], "--capability");
        break;
      case "--url":
        raw.url = requireValue(argv[++i], "--url");
        break;
      case "--goal":
        raw.goal = requireValue(argv[++i], "--goal");
        break;
      case "--target-name":
        raw.targetName = requireValue(argv[++i], "--target-name");
        break;
      case "--base-url":
        raw.baseUrl = requireValue(argv[++i], "--base-url");
        break;
      case "--n":
        raw.n = parsePositiveInt(argv[++i], "--n");
        break;
      case "--max-steps":
        raw.maxSteps = parsePositiveInt(argv[++i], "--max-steps");
        break;
      case "--out-dir":
        raw.outDir = requireValue(argv[++i], "--out-dir");
        break;
      case "--plan":
        raw.plan = true;
        break;
      case "--propose":
        raw.propose = true;
        break;
      case "--target-path":
        raw.targetPath = requireValue(argv[++i], "--target-path");
        break;
      case "--repo":
        raw.repo = requireValue(argv[++i], "--repo");
        break;
      case "--base":
        raw.base = requireValue(argv[++i], "--base");
        break;
      default:
        throw new UsageError(`unknown option '${arg}'`);
    }
  }

  if (!raw.graphFile && !raw.corpus) {
    throw new UsageError("qa requires --graph-file <path> or --corpus <dir>");
  }
  if (raw.graphFile && raw.corpus) {
    throw new UsageError("pass only one of --graph-file or --corpus");
  }
  if (!raw.url) {
    throw new UsageError("qa requires --url <url>");
  }
  if (raw.propose) {
    if (!raw.targetPath) throw new UsageError("--propose requires --target-path <path>");
    if (!raw.repo) throw new UsageError("--propose requires --repo <owner/name>");
    if (!raw.repo.includes("/")) throw new UsageError("--repo must be 'owner/name'");
  }

  return {
    ...(raw.graphFile !== undefined ? { graphFile: raw.graphFile } : {}),
    ...(raw.corpus !== undefined ? { corpus: raw.corpus } : {}),
    ...(raw.capability !== undefined ? { capability: raw.capability } : {}),
    url: raw.url,
    ...(raw.goal !== undefined ? { goal: raw.goal } : {}),
    targetName: raw.targetName ?? "local",
    baseUrl: raw.baseUrl ?? raw.url,
    n: raw.n ?? 3,
    ...(raw.maxSteps !== undefined ? { maxSteps: raw.maxSteps } : {}),
    outDir: raw.outDir ?? "tests/generated",
    plan: raw.plan ?? false,
    propose: raw.propose ?? false,
    ...(raw.targetPath !== undefined ? { targetPath: raw.targetPath } : {}),
    ...(raw.base !== undefined ? { base: raw.base } : {}),
    ...(raw.repo !== undefined ? { repo: raw.repo } : {}),
  };
}

/** Resolve a model from the environment (bundled Claude adapter). */
function resolveModel(): ModelClient {
  if (process.env.ANTHROPIC_API_KEY) return new ClaudeModelClient();
  throw new UsageError(
    "qa needs a model: set ANTHROPIC_API_KEY to use the bundled Claude adapter, " +
      "or call runQa() from the library with your own ModelClient.",
  );
}

/** A browser-backed drive seam: launch Chromium, drive, always close. */
function browserDrive(model: ModelClient): (options: DriveOptions) => Promise<DriveResult> {
  return async (options) => {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      return await new AutonomousDriver(page, model, options).drive();
    } finally {
      await browser.close();
    }
  };
}

function resolveProposer(args: QaArgs): WriteBackProposer | undefined {
  if (!args.propose) return undefined;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new UsageError(
      "--propose needs a GitHub token in GITHUB_TOKEN (contents:write + pull_requests:write).",
    );
  }
  const [owner, repo] = args.repo!.split("/", 2);
  const gateway = new GitHubRestGateway({ owner: owner!, repo: repo!, token });
  return new GitHubWriteBackProposer(gateway);
}

async function runQaCommand(argv: string[]): Promise<number> {
  // PR-triggered scoped mode is selected by --config.
  if (argv.includes("--config")) return runScopedCommand(argv);

  const args = parseQaArgs(argv);
  const model = resolveModel();
  const proposer = resolveProposer(args);

  const graph = args.graphFile
    ? await loadGraphFromFile(args.graphFile)
    : await loadGraphFromCorpus(args.corpus!);

  const target: RunTarget = { name: args.targetName, baseURL: args.baseUrl };
  const options: QaOptions = {
    graph,
    ...(args.capability !== undefined ? { capabilityId: args.capability } : {}),
    startUrl: args.url,
    ...(args.goal !== undefined ? { goal: args.goal } : {}),
    target,
    n: args.n,
    ...(args.maxSteps !== undefined ? { maxSteps: args.maxSteps } : {}),
    ...(args.plan ? { plan: true } : {}),
    ...(args.propose
      ? { propose: { targetPath: args.targetPath!, ...(args.base !== undefined ? { baseBranch: args.base } : {}) } }
      : {}),
  };
  const deps: QaDeps = {
    drive: browserDrive(model),
    compiler: new CodegenCompiler({ outDir: args.outDir }),
    runner: new PlaywrightRunner(),
    learning: new FileLearningStore(),
    ...(proposer ? { proposer } : {}),
  };

  const result = await runQa(deps, options);
  process.stdout.write(renderQaResult(result) + "\n");
  return result.verified ? EXIT_OK : EXIT_UNVERIFIED;
}

function renderQaResult(result: Awaited<ReturnType<typeof runQa>>): string {
  const v = result.loop.verdict;
  const lines = [
    `Capability: ${result.capability.id} — ${result.capability.title}`,
    `Drive: ${result.drive.steps} step(s), ${result.drive.finished ? "finished" : "stopped at step budget"}`,
    `Compiled: ${result.loop.candidate.specPath}`,
    `Fidelity: ${v.passed}/${v.attempts} re-runs green — ${v.stable ? "stable" : "unstable, quarantined"}`,
  ];
  if (result.writeBack) {
    lines.push(
      result.writeBack.status === "proposed"
        ? `Write-back: proposed ${result.writeBack.url}`
        : `Write-back: no change (${result.writeBack.reason})`,
    );
  } else if (result.verified) {
    lines.push("Write-back: not requested (pass --propose to open a PR)");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// qa --config (PR-triggered, diff-scoped)
// ---------------------------------------------------------------------------

export interface ScopedArgs {
  graphFile?: string;
  corpus?: string;
  config: string;
  changed?: string[];
  baseRef?: string;
  url?: string;
  targetName: string;
  n: number;
  maxSteps?: number;
  outDir: string;
  plan: boolean;
  concurrency?: number;
  propose: boolean;
  base?: string;
  repo?: string;
  pr?: number;
}

/** Parse `qa --config …` (scoped) arguments. Pure and exported for testing. */
export function parseScopedArgs(argv: string[]): ScopedArgs {
  const raw: Partial<ScopedArgs> & { propose: boolean } = { propose: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--graph-file":
        raw.graphFile = requireValue(argv[++i], "--graph-file");
        break;
      case "--corpus":
        raw.corpus = requireValue(argv[++i], "--corpus");
        break;
      case "--config":
        raw.config = requireValue(argv[++i], "--config");
        break;
      case "--changed":
        raw.changed = requireValue(argv[++i], "--changed")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--base-ref":
        raw.baseRef = requireValue(argv[++i], "--base-ref");
        break;
      case "--url":
        raw.url = requireValue(argv[++i], "--url");
        break;
      case "--target-name":
        raw.targetName = requireValue(argv[++i], "--target-name");
        break;
      case "--n":
        raw.n = parsePositiveInt(argv[++i], "--n");
        break;
      case "--max-steps":
        raw.maxSteps = parsePositiveInt(argv[++i], "--max-steps");
        break;
      case "--out-dir":
        raw.outDir = requireValue(argv[++i], "--out-dir");
        break;
      case "--plan":
        raw.plan = true;
        break;
      case "--concurrency":
        raw.concurrency = parsePositiveInt(argv[++i], "--concurrency");
        break;
      case "--propose":
        raw.propose = true;
        break;
      case "--base":
        raw.base = requireValue(argv[++i], "--base");
        break;
      case "--repo":
        raw.repo = requireValue(argv[++i], "--repo");
        break;
      case "--pr":
        raw.pr = parsePositiveInt(argv[++i], "--pr");
        break;
      default:
        throw new UsageError(`unknown option '${arg}'`);
    }
  }

  if (!raw.graphFile && !raw.corpus) throw new UsageError("qa requires --graph-file <path> or --corpus <dir>");
  if (raw.graphFile && raw.corpus) throw new UsageError("pass only one of --graph-file or --corpus");
  if (!raw.config) throw new UsageError("scoped qa requires --config <path>");
  if (!raw.changed && !raw.baseRef) throw new UsageError("scoped qa requires --changed <files> or --base-ref <ref>");
  if (raw.changed && raw.baseRef) throw new UsageError("pass only one of --changed or --base-ref");
  if ((raw.propose || raw.pr !== undefined) && !raw.repo) {
    throw new UsageError("--propose / --pr require --repo <owner/name>");
  }
  if (raw.repo && !raw.repo.includes("/")) throw new UsageError("--repo must be 'owner/name'");

  return {
    ...(raw.graphFile !== undefined ? { graphFile: raw.graphFile } : {}),
    ...(raw.corpus !== undefined ? { corpus: raw.corpus } : {}),
    config: raw.config,
    ...(raw.changed !== undefined ? { changed: raw.changed } : {}),
    ...(raw.baseRef !== undefined ? { baseRef: raw.baseRef } : {}),
    ...(raw.url !== undefined ? { url: raw.url } : {}),
    targetName: raw.targetName ?? "local",
    n: raw.n ?? 3,
    ...(raw.maxSteps !== undefined ? { maxSteps: raw.maxSteps } : {}),
    outDir: raw.outDir ?? "tests/generated",
    plan: raw.plan ?? false,
    ...(raw.concurrency !== undefined ? { concurrency: raw.concurrency } : {}),
    propose: raw.propose,
    ...(raw.base !== undefined ? { base: raw.base } : {}),
    ...(raw.repo !== undefined ? { repo: raw.repo } : {}),
    ...(raw.pr !== undefined ? { pr: raw.pr } : {}),
  };
}

/** Files changed against a git ref, as `git diff --name-only <ref>`. */
async function gitChangedFiles(baseRef: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", baseRef], { maxBuffer: 16 * 1024 * 1024 });
    return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch (err) {
    throw new UsageError(`git diff --name-only ${baseRef} failed: ${(err as Error).message}`);
  }
}

/** Map a scoped run into the PR comment input. */
function toScopedComment(
  result: ScopedQaResult,
  changedCount: number,
  failureSuggestions: FailureSuggestion[] = [],
): ScopedQaCommentInput {
  const driven: ScopedQaCommentRow[] = result.driven.map((d) => {
    if (d.error !== undefined) return { id: d.capability.id, title: d.capability.title, error: d.error };
    const r = d.result!;
    const row: ScopedQaCommentRow = { id: d.capability.id, title: d.capability.title, stable: r.verified };
    if (r.writeBack?.status === "proposed") row.writeBackUrl = r.writeBack.url;
    return row;
  });
  return {
    changedCount,
    driven,
    alreadyVerified: result.scope.scoped.filter((s) => s.verified).map((s) => ({ id: s.id, title: s.title })),
    unknown: result.scope.unknown,
    ...(failureSuggestions.length > 0 ? { failureSuggestions } : {}),
  };
}

async function runScopedCommand(argv: string[]): Promise<number> {
  const args = parseScopedArgs(argv);
  const model = resolveModel();

  const graph = args.graphFile
    ? await loadGraphFromFile(args.graphFile)
    : await loadGraphFromCorpus(args.corpus!);

  let configText: string;
  try {
    configText = await readFile(args.config, "utf8");
  } catch (err) {
    throw new UsageError(`could not read config '${args.config}': ${(err as Error).message}`);
  }
  const config = parseConfig(configText);

  const changedPaths = args.changed ?? (await gitChangedFiles(args.baseRef!));

  // A gateway is needed to propose write-backs and/or post the PR comment.
  let gateway: GitHubRestGateway | undefined;
  if (args.repo) {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!token) throw new UsageError("--propose / --pr need a GitHub token in GITHUB_TOKEN.");
    const [owner, repo] = args.repo.split("/", 2);
    gateway = new GitHubRestGateway({ owner: owner!, repo: repo!, token });
  }
  const proposer = args.propose && gateway ? new GitHubWriteBackProposer(gateway) : undefined;

  // Per-capability isolated output so concurrent drives never clobber each other.
  const dirSlug = (id: string): string => id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "capability";
  const learning = new FileLearningStore();
  const deps: ScopedQaDeps = {
    drive: browserDrive(model),
    makeCompiler: (id) => new CodegenCompiler({ outDir: `${args.outDir}/${dirSlug(id)}` }),
    makeRunner: (id) => new PlaywrightRunner({ outputDir: `test-results/${dirSlug(id)}` }),
    learning,
    ...(proposer ? { proposer } : {}),
  };

  const result = await runScopedQa(deps, {
    graph,
    config,
    changedPaths,
    targetName: args.targetName,
    ...(args.url !== undefined ? { defaultUrl: args.url } : {}),
    n: args.n,
    ...(args.maxSteps !== undefined ? { maxSteps: args.maxSteps } : {}),
    ...(args.plan ? { plan: true } : {}),
    ...(args.concurrency !== undefined ? { concurrency: args.concurrency } : {}),
    ...(args.propose ? { propose: { ...(args.base !== undefined ? { baseBranch: args.base } : {}) } } : {}),
  });

  // Failure-learning: surface recorded failure modes in the report (suggest_in_report).
  // The catalog-write strategies write outside the propose-only boundary — deferred.
  const strategy = config.failureLearning ?? "suggest_in_report";
  if (strategy !== "suggest_in_report") {
    process.stderr.write(
      `note: failureLearning '${strategy}' writes catalog updates outside the propose-only ` +
        "boundary and is not yet wired; surfacing failure modes in the report instead.\n",
    );
  }
  const suggestions = await collectFailureSuggestions(result, learning);

  process.stdout.write(renderScopedQaComment(toScopedComment(result, changedPaths.length, suggestions)) + "\n");

  if (gateway && args.pr !== undefined) {
    await upsertComment(gateway, {
      number: args.pr,
      marker: SCOPED_QA_MARKER,
      body: renderScopedQaComment(toScopedComment(result, changedPaths.length, suggestions)),
    });
  }

  // Gate red if any touched-and-unverified capability did not become stable.
  const anyUnverified = result.driven.some((d) => d.error !== undefined || d.result?.verified !== true);
  return anyUnverified ? EXIT_UNVERIFIED : EXIT_OK;
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

/** The package version, read from the bundled package.json (works from dist/ and via tsx). */
function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version?: string;
  };
  return pkg.version ?? "0.0.0";
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === "--help" || command === "-h" || command === undefined) {
    process.stdout.write(USAGE);
    return command === undefined ? EXIT_USAGE : EXIT_OK;
  }

  if (command === "--version" || command === "-v") {
    process.stdout.write(readVersion() + "\n");
    return EXIT_OK;
  }

  try {
    switch (command) {
      case "coverage":
        return await runCoverage(rest);
      case "init":
        return await runInit(rest);
      case "qa":
      case "verify":
        return await runQaCommand(rest);
      default:
        process.stderr.write(`unknown command '${command}'\n\n${USAGE}`);
        return EXIT_USAGE;
    }
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`error: ${err.message}\n\n${USAGE}`);
      return EXIT_USAGE;
    }
    if (err instanceof GraphParseError || err instanceof ConfigParseError) {
      process.stderr.write(`error: ${err.message}\n`);
      return EXIT_USAGE;
    }
    throw err;
  }
}

// Entry point when invoked as a binary — guarded so importing `main` (e.g. in
// tests) does not execute the CLI.
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

const invokedDirectly = argv[1] !== undefined && fileURLToPath(import.meta.url) === argv[1];
if (invokedDirectly) {
  main(argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(`fatal: ${(err as Error).message}\n`);
      process.exitCode = 1;
    });
}
