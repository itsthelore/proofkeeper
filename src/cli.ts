#!/usr/bin/env node
/**
 * The `proofkeeper` CLI.
 *
 * - `coverage` exposes the coverage read-model (Initiative 1).
 * - `qa` (alias `verify`) runs the full DROID loop for one capability: select →
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
import { AutonomousDriver, type DriveOptions, type DriveResult } from "./agent/drive.js";
import type { ModelClient } from "./agent/model.js";
import { ClaudeModelClient } from "./agent/adapters/claude.js";
import { CodegenCompiler } from "./compiler/compiler.js";
import { PlaywrightRunner } from "./runner/playwright-runner.js";
import type { RunTarget } from "./runner/types.js";
import { GitHubRestGateway } from "./writeback/gateways/github-rest.js";
import { GitHubWriteBackProposer, type WriteBackProposer } from "./writeback/proposer.js";

const EXIT_OK = 0;
const EXIT_UNVERIFIED = 1;
const EXIT_USAGE = 2;

const USAGE = `proofkeeper — autonomous verification for the Lore family

Usage:
  proofkeeper coverage (--graph-file <path> | --corpus <dir>) [--json]
  proofkeeper qa (--graph-file <path> | --corpus <dir>) --url <url> [options]
  proofkeeper --help

Commands:
  coverage    Report which Lore capabilities have no verifying (verified_by) test.
  qa          Drive one capability, compile a test, gate it on fidelity, and
              (optionally) propose the Verified By write-back. Alias: verify.

Coverage options:
  --graph-file <path>   Read a 'rac export --graph' JSON file (primary).
  --corpus <dir>        Shell out to 'rac export --graph <dir>' (requires rac on PATH).
  --json                Emit the stable machine-readable contract.

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
  --propose             Propose a Verified By write-back PR when the test is stable.
  --target-path <path>  Artifact to write back to (required with --propose).
  --repo <owner/name>   Target repository for the write-back (required with --propose).
  --base <branch>       Base branch the write-back PR targets (default: main).

Model: qa uses the bundled Claude adapter when ANTHROPIC_API_KEY is set. Bring a
different provider by calling runQa() from the library with your own ModelClient.
Write-back: --propose needs a GitHub token in GITHUB_TOKEN.

Options:
  --help, -h            Show this help.

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
    ...(args.propose
      ? { propose: { targetPath: args.targetPath!, ...(args.base !== undefined ? { baseBranch: args.base } : {}) } }
      : {}),
  };
  const deps: QaDeps = {
    drive: browserDrive(model),
    compiler: new CodegenCompiler({ outDir: args.outDir }),
    runner: new PlaywrightRunner(),
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
// dispatch
// ---------------------------------------------------------------------------

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === "--help" || command === "-h" || command === undefined) {
    process.stdout.write(USAGE);
    return command === undefined ? EXIT_USAGE : EXIT_OK;
  }

  try {
    switch (command) {
      case "coverage":
        return await runCoverage(rest);
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
    if (err instanceof GraphParseError) {
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
