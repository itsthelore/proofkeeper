/**
 * How the coverage read-model obtains a graph export.
 *
 * Two source modes, both staying on the contract-consumer side of the boundary
 * (ADR-063, ADR-083):
 *
 *  - `--graph-file`: read a `rac export --graph` JSON file. The primary,
 *    fully-offline, fully-testable path.
 *  - `--corpus`: a convenience that shells out to `rac export --graph <dir>`
 *    when the `rac` CLI is on PATH. We consume its published JSON output — we
 *    never import the engine.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { GraphParseError, parseGraph, type Graph } from "./graph.js";

const execFileAsync = promisify(execFile);

/** Load and parse a graph export from a JSON file. */
export async function loadGraphFromFile(path: string): Promise<Graph> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    throw new GraphParseError(`could not read graph file '${path}': ${(err as Error).message}`);
  }
  return parseGraph(text);
}

/**
 * Produce a graph export by invoking `rac export --graph <dir>`.
 *
 * Requires the `rac` CLI on PATH. We treat its stdout as the published
 * contract and parse it exactly as we would a file.
 */
export async function loadGraphFromCorpus(corpusDir: string, racBin = "rac"): Promise<Graph> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(racBin, ["export", corpusDir, "--graph"], {
      maxBuffer: 64 * 1024 * 1024,
    }));
  } catch (err) {
    throw new GraphParseError(
      `failed to run '${racBin} export ${corpusDir} --graph': ${(err as Error).message}. ` +
        `Is the rac CLI installed and on PATH? You can also pass --graph-file directly.`,
    );
  }
  return parseGraph(stdout);
}
