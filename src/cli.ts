#!/usr/bin/env node
/**
 * The `proofkeeper` CLI.
 *
 * v0.0.1 exposes the coverage read-model (Initiative 1). Exit codes are a
 * stable contract: 0 = all capabilities verified, 1 = one or more unverified
 * (so CI can gate on it), 2 = usage/parse error.
 */

import { computeCoverage } from "./coverage/model.js";
import { renderHuman, renderJson } from "./coverage/report.js";
import { GraphParseError } from "./coverage/graph.js";
import { loadGraphFromCorpus, loadGraphFromFile } from "./coverage/source.js";

const EXIT_OK = 0;
const EXIT_UNVERIFIED = 1;
const EXIT_USAGE = 2;

const USAGE = `proofkeeper — autonomous verification for the Lore family

Usage:
  proofkeeper coverage (--graph-file <path> | --corpus <dir>) [--json]
  proofkeeper --help

Commands:
  coverage    Report which Lore capabilities have no verifying (verified_by) test.

Options:
  --graph-file <path>   Read a 'rac export --graph' JSON file (primary).
  --corpus <dir>        Shell out to 'rac export --graph <dir>' (requires rac on PATH).
  --json                Emit the stable machine-readable contract.
  --help, -h            Show this help.

Exit codes:
  0  every capability is verified
  1  one or more capabilities are unverified
  2  usage or parse error
`;

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

class UsageError extends Error {}

async function runCoverage(argv: string[]): Promise<number> {
  const args = parseCoverageArgs(argv);
  const graph = args.graphFile
    ? await loadGraphFromFile(args.graphFile)
    : await loadGraphFromCorpus(args.corpus!);

  const report = computeCoverage(graph);
  process.stdout.write((args.json ? renderJson(report) : renderHuman(report)) + "\n");
  return report.unverified.length > 0 ? EXIT_UNVERIFIED : EXIT_OK;
}

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
