import { describe, expect, it } from "vitest";

import { parseScopedArgs } from "../src/cli.js";
import { runScopedQa, type ScopedQaDeps } from "../src/qa/run-scoped.js";
import { renderScopedQaComment } from "../src/writeback/comment.js";
import type { QaDeps } from "../src/qa/run-qa.js";
import type { Graph } from "../src/coverage/graph.js";
import type { ProofkeeperConfig } from "../src/scope/config.js";
import type { RecordedSession } from "../src/compiler/actions.js";
import type { CandidateTest, Compiler } from "../src/compiler/types.js";
import type { CompiledTest, RunOptions, RunResult, RunStatus, Runner } from "../src/runner/types.js";
import type { DriveOptions, DriveResult } from "../src/agent/drive.js";
import type { WriteBackInput, WriteBackProposer, WriteBackResult } from "../src/writeback/proposer.js";

const GRAPH: Graph = {
  schema_version: "1",
  source: "demo",
  nodes: [
    { id: "REQ-A", type: "requirement", status: "Accepted", title: "Alpha" },
    { id: "REQ-B", type: "requirement", status: "Accepted", title: "Beta" },
    { id: "REQ-C", type: "requirement", status: "Accepted", title: "Gamma" },
  ],
  edges: [{ source: "REQ-A", target: "tests/a.spec.ts", type: "verified_by", directed: true, resolved: false }],
};

const CONFIG: ProofkeeperConfig = {
  capabilities: [
    { id: "REQ-A", paths: ["src/a/**"] },
    { id: "REQ-B", paths: ["src/b/**"], url: "http://b/", artifact: "rac/b.md" },
    { id: "REQ-C", paths: ["src/c/**"] }, // no url, no artifact
  ],
};

class FakeCompiler implements Compiler {
  compile(session: RecordedSession): Promise<CandidateTest> {
    const id = session.capabilityId ?? "cand";
    return Promise.resolve({ id, specPath: `tests/generated/${id}.spec.ts`, title: session.title, fromSession: session });
  }
}

class FakeRunner implements Runner {
  constructor(private readonly status: RunStatus) {}
  run(suite: CompiledTest[], _options: RunOptions): Promise<RunResult[]> {
    return Promise.resolve(
      suite.map((t) => ({ testId: t.id, target: "local", status: this.status, durationMs: 5, tracePath: `tr/${t.id}.zip` })),
    );
  }
}

class FakeProposer implements WriteBackProposer {
  inputs: WriteBackInput[] = [];
  propose(input: WriteBackInput): Promise<WriteBackResult> {
    this.inputs.push(input);
    return Promise.resolve({ status: "proposed", url: `https://gh/pull/${this.inputs.length}`, number: this.inputs.length, headBranch: "h" });
  }
}

function fakeDrive(driven: string[]): QaDeps["drive"] {
  return (options: DriveOptions) => {
    driven.push(options.capabilityId ?? "?");
    const session: RecordedSession = {
      ...(options.capabilityId !== undefined ? { capabilityId: options.capabilityId } : {}),
      title: options.title,
      startUrl: options.startUrl,
      actions: [{ type: "goto", url: options.startUrl }],
    };
    return Promise.resolve({ session, finished: true, steps: 1 } satisfies DriveResult);
  };
}

describe("runScopedQa", () => {
  it("drives only the unverified capabilities a change touched", async () => {
    const driven: string[] = [];
    const deps: ScopedQaDeps = { drive: fakeDrive(driven), makeCompiler: () => new FakeCompiler(), makeRunner: () => new FakeRunner("passed") };
    const result = await runScopedQa(deps, {
      graph: GRAPH,
      config: CONFIG,
      changedPaths: ["src/a/x.ts", "src/b/y.ts"], // REQ-A verified, REQ-B not
      targetName: "local",
      n: 2,
    });

    expect(driven).toEqual(["REQ-B"]);
    expect(result.scope.scoped.map((s) => s.id).sort()).toEqual(["REQ-A", "REQ-B"]);
    expect(result.driven[0]?.result?.verified).toBe(true);
  });

  it("records an error when a capability has no start URL", async () => {
    const deps: ScopedQaDeps = { drive: fakeDrive([]), makeCompiler: () => new FakeCompiler(), makeRunner: () => new FakeRunner("passed") };
    const result = await runScopedQa(deps, {
      graph: GRAPH,
      config: CONFIG,
      changedPaths: ["src/c/z.ts"], // REQ-C unverified, no url, no defaultUrl
      targetName: "local",
      n: 1,
    });
    expect(result.driven[0]?.error).toMatch(/no start URL/);
    expect(result.driven[0]?.result).toBeUndefined();
  });

  it("proposes a write-back only for capabilities that declare an artifact", async () => {
    const proposer = new FakeProposer();
    const deps: ScopedQaDeps = { drive: fakeDrive([]), makeCompiler: () => new FakeCompiler(), makeRunner: () => new FakeRunner("passed"), proposer };
    await runScopedQa(deps, {
      graph: GRAPH,
      config: CONFIG,
      changedPaths: ["src/b/y.ts", "src/c/z.ts"], // REQ-B has artifact, REQ-C does not
      targetName: "local",
      defaultUrl: "http://default/",
      n: 1,
      propose: { baseBranch: "main" },
    });
    expect(proposer.inputs.map((i) => i.capabilityId)).toEqual(["REQ-B"]);
    expect(proposer.inputs[0]?.targetPath).toBe("rac/b.md");
  });

  it("mints an isolated compiler and runner per capability", async () => {
    const compilerIds: string[] = [];
    const runnerIds: string[] = [];
    const deps: ScopedQaDeps = {
      drive: fakeDrive([]),
      makeCompiler: (id) => {
        compilerIds.push(id);
        return new FakeCompiler();
      },
      makeRunner: (id) => {
        runnerIds.push(id);
        return new FakeRunner("passed");
      },
    };
    await runScopedQa(deps, {
      graph: GRAPH,
      config: CONFIG,
      changedPaths: ["src/b/y.ts", "src/c/z.ts"],
      targetName: "local",
      defaultUrl: "http://default/",
      n: 1,
    });
    expect(compilerIds.sort()).toEqual(["REQ-B", "REQ-C"]);
    expect(runnerIds.sort()).toEqual(["REQ-B", "REQ-C"]);
  });

  it("drives capabilities concurrently up to the limit, returning results in scoped order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slowDrive: ScopedQaDeps["drive"] = async (options: DriveOptions) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      const session: RecordedSession = {
        ...(options.capabilityId !== undefined ? { capabilityId: options.capabilityId } : {}),
        title: options.title,
        startUrl: options.startUrl,
        actions: [{ type: "goto", url: options.startUrl }],
      };
      return { session, finished: true, steps: 1 } satisfies DriveResult;
    };
    const deps: ScopedQaDeps = { drive: slowDrive, makeCompiler: () => new FakeCompiler(), makeRunner: () => new FakeRunner("passed") };
    const result = await runScopedQa(deps, {
      graph: GRAPH,
      config: CONFIG,
      changedPaths: ["src/b/y.ts", "src/c/z.ts"], // REQ-B (url) + REQ-C (defaultUrl)
      targetName: "local",
      defaultUrl: "http://default/",
      n: 1,
      concurrency: 2,
    });
    expect(maxInFlight).toBe(2);
    // Deterministic scoped order regardless of which finished first.
    expect(result.driven.map((d) => d.capability.id)).toEqual(["REQ-B", "REQ-C"]);
  });

  it("respects the concurrency limit (1 = sequential)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const serialDrive: ScopedQaDeps["drive"] = async (options: DriveOptions) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return {
        session: { ...(options.capabilityId !== undefined ? { capabilityId: options.capabilityId } : {}), title: options.title, startUrl: options.startUrl, actions: [{ type: "goto", url: options.startUrl }] },
        finished: true,
        steps: 1,
      } satisfies DriveResult;
    };
    const deps: ScopedQaDeps = { drive: serialDrive, makeCompiler: () => new FakeCompiler(), makeRunner: () => new FakeRunner("passed") };
    await runScopedQa(deps, {
      graph: GRAPH,
      config: CONFIG,
      changedPaths: ["src/b/y.ts", "src/c/z.ts"],
      targetName: "local",
      defaultUrl: "http://default/",
      n: 1,
      concurrency: 1,
    });
    expect(maxInFlight).toBe(1);
  });
});

describe("renderScopedQaComment", () => {
  it("summarises stable, unstable, error, already-verified, and unknown rows", () => {
    const body = renderScopedQaComment({
      changedCount: 3,
      driven: [
        { id: "REQ-B", title: "Beta", stable: true, writeBackUrl: "https://gh/pull/1" },
        { id: "REQ-C", title: "Gamma", stable: false },
        { id: "REQ-D", title: "Delta", error: "no start URL" },
      ],
      alreadyVerified: [{ id: "REQ-A", title: "Alpha" }],
      unknown: ["REQ-Q"],
    });
    expect(body).toContain("Proofkeeper QA — 3 changed file(s)");
    expect(body).toContain("✅ **REQ-B** — Beta: stable — proposed https://gh/pull/1");
    expect(body).toContain("❌ **REQ-C** — Gamma: unstable (quarantined)");
    expect(body).toContain("⚠️ **REQ-D** — Delta: no start URL");
    expect(body).toContain("Already verified, not re-driven:");
    expect(body).toContain("REQ-A — Alpha");
    expect(body).toContain("Config ids not found as capabilities in the graph: REQ-Q");
  });
});

describe("parseScopedArgs", () => {
  it("parses a --changed list with defaults", () => {
    const args = parseScopedArgs(["--graph-file", "g.json", "--config", "pk.json", "--changed", "src/a.ts, src/b.ts"]);
    expect(args).toMatchObject({
      graphFile: "g.json",
      config: "pk.json",
      changed: ["src/a.ts", "src/b.ts"],
      targetName: "local",
      n: 3,
      outDir: "tests/generated",
      propose: false,
    });
  });

  it("requires a config and a change source", () => {
    expect(() => parseScopedArgs(["--graph-file", "g.json", "--changed", "a"])).toThrow(/--config/);
    expect(() => parseScopedArgs(["--graph-file", "g.json", "--config", "pk.json"])).toThrow(/--changed/);
  });

  it("rejects both --changed and --base-ref", () => {
    expect(() =>
      parseScopedArgs(["--graph-file", "g.json", "--config", "pk.json", "--changed", "a", "--base-ref", "main"]),
    ).toThrow(/only one/);
  });

  it("requires --repo with --propose or --pr", () => {
    const base = ["--graph-file", "g.json", "--config", "pk.json", "--changed", "a"];
    expect(() => parseScopedArgs([...base, "--propose"])).toThrow(/--repo/);
    expect(() => parseScopedArgs([...base, "--pr", "7"])).toThrow(/--repo/);
    expect(parseScopedArgs([...base, "--pr", "7", "--repo", "itsthelore/x"])).toMatchObject({ pr: 7, repo: "itsthelore/x" });
  });
});
