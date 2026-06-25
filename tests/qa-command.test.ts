import { describe, expect, it } from "vitest";

import { parseQaArgs } from "../src/cli.js";
import { runQa, selectCapability, defaultGoal, type QaDeps } from "../src/qa/run-qa.js";
import type { Graph } from "../src/coverage/graph.js";
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
    { id: "ADR-1", type: "decision", status: "Accepted", title: "Dee" },
  ],
  edges: [{ source: "REQ-A", target: "tests/a.spec.ts", type: "verified_by", directed: true, resolved: false }],
};

class FakeCompiler implements Compiler {
  compile(session: RecordedSession): Promise<CandidateTest> {
    return Promise.resolve({ id: "cand", specPath: "tests/generated/cand.spec.ts", title: session.title, fromSession: session });
  }
}

class FakeRunner implements Runner {
  calls = 0;
  constructor(private readonly status: RunStatus) {}
  run(suite: CompiledTest[], _options: RunOptions): Promise<RunResult[]> {
    this.calls++;
    return Promise.resolve(
      suite.map((t) => ({
        testId: t.id,
        target: "local",
        status: this.status,
        durationMs: 5,
        tracePath: `test-results/${t.id}/trace.zip`,
      })),
    );
  }
}

class FakeProposer implements WriteBackProposer {
  input?: WriteBackInput;
  propose(input: WriteBackInput): Promise<WriteBackResult> {
    this.input = input;
    return Promise.resolve({
      status: "proposed",
      url: "https://github.com/x/pull/9",
      number: 9,
      headBranch: "proofkeeper/verified-by/req-b",
    });
  }
}

function fakeDrive(captured: { options?: DriveOptions }): QaDeps["drive"] {
  return (options) => {
    captured.options = options;
    const session: RecordedSession = {
      ...(options.capabilityId !== undefined ? { capabilityId: options.capabilityId } : {}),
      title: options.title,
      startUrl: options.startUrl,
      actions: [{ type: "goto", url: options.startUrl }],
    };
    return Promise.resolve({ session, finished: true, steps: 2 } satisfies DriveResult);
  };
}

const TARGET = { name: "local", baseURL: "http://localhost:3000/" };

describe("selectCapability", () => {
  it("picks the first unverified capability by default", () => {
    expect(selectCapability(GRAPH).id).toBe("REQ-B");
  });

  it("returns the named capability even when already verified (re-verify)", () => {
    expect(selectCapability(GRAPH, "REQ-A").id).toBe("REQ-A");
  });

  it("throws when the named capability is not a requirement node", () => {
    expect(() => selectCapability(GRAPH, "REQ-X")).toThrow(/not a requirement node/);
  });

  it("throws when every capability is already verified", () => {
    const allVerified: Graph = {
      ...GRAPH,
      nodes: [{ id: "REQ-A", type: "requirement", status: "Accepted", title: "Alpha" }],
    };
    expect(() => selectCapability(allVerified)).toThrow(/already verified/);
  });
});

describe("runQa", () => {
  it("drives the selected capability with a derived title and goal", async () => {
    const captured: { options?: DriveOptions } = {};
    const deps: QaDeps = { drive: fakeDrive(captured), compiler: new FakeCompiler(), runner: new FakeRunner("passed") };
    await runQa(deps, { graph: GRAPH, startUrl: "http://x/", target: TARGET, n: 3 });

    expect(captured.options?.capabilityId).toBe("REQ-B");
    expect(captured.options?.title).toBe("verify Beta");
    expect(captured.options?.goal).toBe(defaultGoal(selectCapability(GRAPH)));
    expect(captured.options?.goal).toContain("REQ-B");
  });

  it("reports verified and proposes a write-back when the test is stable", async () => {
    const proposer = new FakeProposer();
    const deps: QaDeps = {
      drive: fakeDrive({}),
      compiler: new FakeCompiler(),
      runner: new FakeRunner("passed"),
      proposer,
    };
    const result = await runQa(deps, {
      graph: GRAPH,
      startUrl: "http://x/",
      target: TARGET,
      n: 3,
      propose: { targetPath: "rac/requirements/beta.md", baseBranch: "main" },
    });

    expect(result.verified).toBe(true);
    expect(result.writeBack?.status).toBe("proposed");
    expect(proposer.input?.capabilityId).toBe("REQ-B");
    expect(proposer.input?.targetPath).toBe("rac/requirements/beta.md");
    expect(proposer.input?.links).toEqual([
      { test: "tests/generated/cand.spec.ts", trace: "test-results/cand/trace.zip" },
    ]);
    expect(proposer.input?.fidelity).toEqual({ attempts: 3, passed: 3, stable: true });
  });

  it("does not propose when the test is unstable", async () => {
    const proposer = new FakeProposer();
    const deps: QaDeps = {
      drive: fakeDrive({}),
      compiler: new FakeCompiler(),
      runner: new FakeRunner("failed"),
      proposer,
    };
    const result = await runQa(deps, {
      graph: GRAPH,
      startUrl: "http://x/",
      target: TARGET,
      n: 2,
      propose: { targetPath: "rac/requirements/beta.md" },
    });

    expect(result.verified).toBe(false);
    expect(result.writeBack).toBeUndefined();
    expect(proposer.input).toBeUndefined();
  });

  it("does not propose when no propose option is given, even if stable", async () => {
    const proposer = new FakeProposer();
    const deps: QaDeps = { drive: fakeDrive({}), compiler: new FakeCompiler(), runner: new FakeRunner("passed"), proposer };
    const result = await runQa(deps, { graph: GRAPH, startUrl: "http://x/", target: TARGET, n: 1 });

    expect(result.verified).toBe(true);
    expect(result.writeBack).toBeUndefined();
    expect(proposer.input).toBeUndefined();
  });
});

describe("parseQaArgs", () => {
  it("applies defaults: target name, base URL = url, n=3, out-dir", () => {
    const args = parseQaArgs(["--graph-file", "g.json", "--url", "http://x/"]);
    expect(args).toMatchObject({
      graphFile: "g.json",
      url: "http://x/",
      targetName: "local",
      baseUrl: "http://x/",
      n: 3,
      outDir: "tests/generated",
      propose: false,
    });
  });

  it("honours overrides for base URL, target name, n, and capability", () => {
    const args = parseQaArgs([
      "--corpus", "rac/", "--url", "http://x/", "--base-url", "http://prod/",
      "--target-name", "prod", "--n", "5", "--capability", "REQ-B",
    ]);
    expect(args).toMatchObject({ corpus: "rac/", baseUrl: "http://prod/", targetName: "prod", n: 5, capability: "REQ-B" });
  });

  it("requires a coverage source", () => {
    expect(() => parseQaArgs(["--url", "http://x/"])).toThrow(/--graph-file/);
  });

  it("rejects two coverage sources", () => {
    expect(() => parseQaArgs(["--graph-file", "g.json", "--corpus", "rac/", "--url", "http://x/"])).toThrow(/only one/);
  });

  it("requires --url", () => {
    expect(() => parseQaArgs(["--graph-file", "g.json"])).toThrow(/--url/);
  });

  it("rejects a non-positive --n", () => {
    expect(() => parseQaArgs(["--graph-file", "g.json", "--url", "http://x/", "--n", "0"])).toThrow(/positive integer/);
  });

  it("requires --target-path and --repo with --propose", () => {
    const base = ["--graph-file", "g.json", "--url", "http://x/", "--propose"];
    expect(() => parseQaArgs(base)).toThrow(/--target-path/);
    expect(() => parseQaArgs([...base, "--target-path", "r.md"])).toThrow(/--repo/);
    expect(() => parseQaArgs([...base, "--target-path", "r.md", "--repo", "nope"])).toThrow(/owner\/name/);
    expect(parseQaArgs([...base, "--target-path", "r.md", "--repo", "itsthelore/x", "--base", "dev"])).toMatchObject({
      propose: true,
      targetPath: "r.md",
      repo: "itsthelore/x",
      base: "dev",
    });
  });

  it("rejects unknown options", () => {
    expect(() => parseQaArgs(["--graph-file", "g.json", "--url", "http://x/", "--bogus"])).toThrow(/unknown option/);
  });
});
