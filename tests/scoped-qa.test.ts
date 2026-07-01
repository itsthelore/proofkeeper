import { describe, expect, it } from "vitest";

import { parseScopedArgs } from "../src/cli.js";
import { runScopedQa, collectFailureSuggestions, type ScopedQaDeps, type ScopedQaResult } from "../src/qa/run-scoped.js";
import type { ScopedCapability } from "../src/scope/diff-scope.js";
import type { QaResult } from "../src/qa/run-qa.js";
import { InMemoryLearningStore } from "../src/learning/store.js";
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
      actions: [
        { type: "goto", url: options.startUrl },
        { type: "expectText", locator: { kind: "testId", testId: "status" }, text: "ok" },
      ],
    };
    return Promise.resolve({ session, finished: true, stopReason: "finished", steps: 1 } satisfies DriveResult);
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

  it("threads environment restrictions and auth into the drive goal", async () => {
    const goals: Record<string, string> = {};
    const capturingDrive: ScopedQaDeps["drive"] = (options: DriveOptions) => {
      goals[options.capabilityId ?? "?"] = options.goal;
      const session: RecordedSession = {
        ...(options.capabilityId !== undefined ? { capabilityId: options.capabilityId } : {}),
        title: options.title,
        startUrl: options.startUrl,
        actions: [
        { type: "goto", url: options.startUrl },
        { type: "expectText", locator: { kind: "testId", testId: "status" }, text: "ok" },
      ],
      };
      return Promise.resolve({ session, finished: true, stopReason: "finished", steps: 1 } satisfies DriveResult);
    };
    const config: ProofkeeperConfig = {
      capabilities: [{ id: "REQ-B", paths: ["src/b/**"], environment: "production" }],
      environments: { production: { url: "https://prod/", restrictions: ["read-only", "never create data"] } },
      auth: { method: "email-password", provider: "WorkOS" },
    };
    const deps: ScopedQaDeps = { drive: capturingDrive, makeCompiler: () => new FakeCompiler(), makeRunner: () => new FakeRunner("passed") };
    await runScopedQa(deps, { graph: GRAPH, config, changedPaths: ["src/b/y.ts"], targetName: "local", n: 1 });

    expect(goals["REQ-B"]).toContain("read-only");
    expect(goals["REQ-B"]).toContain("never create data");
    expect(goals["REQ-B"]).toContain("Authentication: email-password via WorkOS");
  });

  it("threads the config's trust boundary (allowShell / allowedHosts) into each drive", async () => {
    const boundaries: Record<string, { allowShell?: boolean; allowedHosts?: string[] }> = {};
    const capturingDrive: ScopedQaDeps["drive"] = (options: DriveOptions) => {
      boundaries[options.capabilityId ?? "?"] = {
        ...(options.allowShell !== undefined ? { allowShell: options.allowShell } : {}),
        ...(options.allowedHosts !== undefined ? { allowedHosts: options.allowedHosts } : {}),
      };
      const session: RecordedSession = {
        ...(options.capabilityId !== undefined ? { capabilityId: options.capabilityId } : {}),
        title: options.title,
        startUrl: options.startUrl,
        actions: [
        { type: "goto", url: options.startUrl },
        { type: "expectText", locator: { kind: "testId", testId: "status" }, text: "ok" },
      ],
      };
      return Promise.resolve({ session, finished: true, stopReason: "finished", steps: 1 } satisfies DriveResult);
    };
    const config: ProofkeeperConfig = {
      capabilities: [{ id: "REQ-B", paths: ["src/b/**"], url: "http://b/" }],
      allowShell: true,
      allowedHosts: ["api.example.com"],
    };
    const deps: ScopedQaDeps = { drive: capturingDrive, makeCompiler: () => new FakeCompiler(), makeRunner: () => new FakeRunner("passed") };
    await runScopedQa(deps, { graph: GRAPH, config, changedPaths: ["src/b/y.ts"], targetName: "local", n: 1 });

    expect(boundaries["REQ-B"]).toEqual({ allowShell: true, allowedHosts: ["api.example.com"] });
  });

  it("threads a persona's focus and forbidden actions into the drive goal", async () => {
    const goals: Record<string, string> = {};
    const capturingDrive: ScopedQaDeps["drive"] = (options: DriveOptions) => {
      goals[options.capabilityId ?? "?"] = options.goal;
      const session: RecordedSession = {
        ...(options.capabilityId !== undefined ? { capabilityId: options.capabilityId } : {}),
        title: options.title,
        startUrl: options.startUrl,
        actions: [
        { type: "goto", url: options.startUrl },
        { type: "expectText", locator: { kind: "testId", testId: "status" }, text: "ok" },
      ],
      };
      return Promise.resolve({ session, finished: true, stopReason: "finished", steps: 1 } satisfies DriveResult);
    };
    const config: ProofkeeperConfig = {
      capabilities: [{ id: "REQ-B", paths: ["src/b/**"], url: "http://b/", persona: "viewer" }],
      personas: [{ name: "viewer", testFocus: ["dashboards"], cannotDo: ["edit-settings"] }],
    };
    const deps: ScopedQaDeps = { drive: capturingDrive, makeCompiler: () => new FakeCompiler(), makeRunner: () => new FakeRunner("passed") };
    await runScopedQa(deps, { graph: GRAPH, config, changedPaths: ["src/b/y.ts"], targetName: "local", n: 1 });

    expect(goals["REQ-B"]).toContain("Act as the viewer persona");
    expect(goals["REQ-B"]).toContain("Focus on: dashboards");
    expect(goals["REQ-B"]).toContain("Do not: edit-settings");
  });

  it("records an error for a capability referencing an undefined persona", async () => {
    const config: ProofkeeperConfig = {
      capabilities: [{ id: "REQ-B", paths: ["src/b/**"], url: "http://b/", persona: "ghost" }],
      personas: [{ name: "viewer" }],
    };
    const deps: ScopedQaDeps = { drive: fakeDrive([]), makeCompiler: () => new FakeCompiler(), makeRunner: () => new FakeRunner("passed") };
    const result = await runScopedQa(deps, { graph: GRAPH, config, changedPaths: ["src/b/y.ts"], targetName: "local", n: 1 });
    expect(result.driven[0]?.error).toMatch(/undefined persona 'ghost'/);
    expect(result.driven[0]?.result).toBeUndefined();
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
        actions: [
        { type: "goto", url: options.startUrl },
        { type: "expectText", locator: { kind: "testId", testId: "status" }, text: "ok" },
      ],
      };
      return { session, finished: true, stopReason: "finished", steps: 1 } satisfies DriveResult;
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
        stopReason: "finished",
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

function scopedCap(id: string, title: string): ScopedCapability {
  return { id, title, config: { id, paths: ["x"] }, verified: false, matchedPaths: ["x"] };
}

describe("collectFailureSuggestions", () => {
  it("returns recorded failure reasons for failed or errored capabilities only", async () => {
    const learning = new InMemoryLearningStore();
    await learning.recordFailure({ capabilityId: "REQ-X", reason: "the Verify button moved" });
    await learning.recordFailure({ capabilityId: "REQ-Y", reason: "unstable: 1/3 re-runs green" });
    const result: ScopedQaResult = {
      scope: { scoped: [], toVerify: [], unknown: [] },
      driven: [
        { capability: scopedCap("REQ-X", "X"), error: "no start URL" },
        { capability: scopedCap("REQ-Y", "Y"), result: { verified: false } as unknown as QaResult },
        { capability: scopedCap("REQ-Z", "Z"), result: { verified: true } as unknown as QaResult },
      ],
    };
    expect(await collectFailureSuggestions(result, learning)).toEqual([
      { id: "REQ-X", title: "X", reasons: ["the Verify button moved"] },
      { id: "REQ-Y", title: "Y", reasons: ["unstable: 1/3 re-runs green"] },
    ]);
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

  it("renders the known failure modes when failure suggestions are present", () => {
    const body = renderScopedQaComment({
      changedCount: 1,
      driven: [{ id: "REQ-C", title: "Gamma", stable: false }],
      alreadyVerified: [],
      unknown: [],
      failureSuggestions: [{ id: "REQ-C", title: "Gamma", reasons: ["the Verify button moved", "unstable: 1/3"] }],
    });
    expect(body).toContain("Known failure modes:");
    expect(body).toContain("**REQ-C** — Gamma:");
    expect(body).toContain("- the Verify button moved");
    expect(body).toContain("- unstable: 1/3");
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

describe("runScopedQa — per-capability error isolation", () => {
  it("a capability whose drive throws becomes its own error entry; siblings survive", async () => {
    const throwingDrive: ScopedQaDeps["drive"] = (options: DriveOptions) => {
      if (options.capabilityId === "REQ-B") {
        return Promise.reject(new Error("model call failed twice: 502; retry: 502"));
      }
      const session: RecordedSession = {
        ...(options.capabilityId !== undefined ? { capabilityId: options.capabilityId } : {}),
        title: options.title,
        startUrl: options.startUrl,
        actions: [
          { type: "goto", url: options.startUrl },
          { type: "expectText", locator: { kind: "testId", testId: "status" }, text: "ok" },
        ],
      };
      return Promise.resolve({ session, finished: true, stopReason: "finished", steps: 1 } satisfies DriveResult);
    };
    const config: ProofkeeperConfig = {
      capabilities: [
        { id: "REQ-B", paths: ["src/b/**"], url: "http://b/" },
        { id: "REQ-C", paths: ["src/c/**"], url: "http://c/" },
      ],
    };
    const deps: ScopedQaDeps = { drive: throwingDrive, makeCompiler: () => new FakeCompiler(), makeRunner: () => new FakeRunner("passed") };
    const result = await runScopedQa(deps, {
      graph: GRAPH,
      config,
      changedPaths: ["src/b/y.ts", "src/c/z.ts"],
      targetName: "local",
      n: 1,
    });

    const byId = Object.fromEntries(result.driven.map((d) => [d.capability.id, d]));
    expect(byId["REQ-B"]?.error).toMatch(/model call failed twice/);
    expect(byId["REQ-B"]?.result).toBeUndefined();
    // The sibling completed and its result was not discarded.
    expect(byId["REQ-C"]?.result?.verified).toBe(true);
  });
});
