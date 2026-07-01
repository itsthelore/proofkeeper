import { describe, expect, it } from "vitest";

import { parseQaArgs } from "../src/cli.js";
import { runQa, selectCapability, defaultGoal, type QaDeps } from "../src/qa/run-qa.js";
import { InMemoryLearningStore } from "../src/learning/store.js";
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
      actions: [
        { type: "goto", url: options.startUrl },
        // A verifiable session asserts an observable outcome (assertion-free
        // sessions are unverified without compiling).
        { type: "expectText", locator: { kind: "testId", testId: "status" }, text: "ok" },
      ],
      ...(options.plan ? { plan: "1. Navigate to the page\n2. Assert the outcome" } : {}),
    };
    return Promise.resolve({
      session,
      finished: true,
      stopReason: "finished",
      steps: 2,
      ...(options.plan ? { plan: "1. Navigate to the page\n2. Assert the outcome" } : {}),
    } satisfies DriveResult);
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
  it("threads the trust boundary into the drive (and leaves it closed by default)", async () => {
    const captured: { options?: DriveOptions } = {};
    const deps: QaDeps = { drive: fakeDrive(captured), compiler: new FakeCompiler(), runner: new FakeRunner("passed") };

    await runQa(deps, { graph: GRAPH, startUrl: "http://x/", target: TARGET, n: 3 });
    expect(captured.options?.allowShell).toBeUndefined();
    expect(captured.options?.allowedHosts).toBeUndefined();

    await runQa(deps, {
      graph: GRAPH,
      startUrl: "http://x/",
      target: TARGET,
      n: 3,
      allowShell: true,
      allowedHosts: ["api.example.com"],
    });
    expect(captured.options?.allowShell).toBe(true);
    expect(captured.options?.allowedHosts).toEqual(["api.example.com"]);
  });

  it("marks a give-up unverified without compiling, and records the reason", async () => {
    const learning = new InMemoryLearningStore();
    const gaveUpDrive: QaDeps["drive"] = (options) =>
      Promise.resolve({
        session: { title: options.title, startUrl: options.startUrl, actions: [{ type: "goto", url: options.startUrl }] },
        finished: false,
        stopReason: "gave_up",
        gaveUpText: "cannot find the checkout button",
        steps: 4,
      } satisfies DriveResult);
    const deps: QaDeps = { drive: gaveUpDrive, compiler: new FakeCompiler(), runner: new FakeRunner("passed"), learning };

    const result = await runQa(deps, { graph: GRAPH, startUrl: "http://x/", target: TARGET, n: 3 });

    expect(result.verified).toBe(false);
    expect(result.loop).toBeUndefined(); // never compiled, never gated
    expect(result.unverifiedReason).toMatch(/gave up after 4 step\(s\).*cannot find the checkout button/);
    const failures = await learning.priorFailures("REQ-B");
    expect(failures.map((f) => f.reason).join()).toContain("gave up");
  });

  it("marks a finished-but-assertion-free drive unverified — nothing observable was verified", async () => {
    const learning = new InMemoryLearningStore();
    const assertionFreeDrive: QaDeps["drive"] = (options) =>
      Promise.resolve({
        session: { title: options.title, startUrl: options.startUrl, actions: [{ type: "goto", url: options.startUrl }] },
        finished: true,
        stopReason: "finished",
        steps: 2,
      } satisfies DriveResult);
    const deps: QaDeps = { drive: assertionFreeDrive, compiler: new FakeCompiler(), runner: new FakeRunner("passed"), learning };

    const result = await runQa(deps, { graph: GRAPH, startUrl: "http://x/", target: TARGET, n: 3 });

    expect(result.verified).toBe(false);
    expect(result.loop).toBeUndefined();
    expect(result.unverifiedReason).toMatch(/no assertions/);
    expect((await learning.priorFailures("REQ-B")).length).toBe(1);
  });

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

  it("threads the readable step summary into the write-back proposal", async () => {
    const proposer = new FakeProposer();
    const deps: QaDeps = { drive: fakeDrive({}), compiler: new FakeCompiler(), runner: new FakeRunner("passed"), proposer };
    await runQa(deps, {
      graph: GRAPH,
      startUrl: "http://x/",
      target: TARGET,
      n: 1,
      propose: { targetPath: "rac/b.md" },
    });
    expect(proposer.input?.steps).toEqual(["Navigate to http://x/", 'Expect [status] to read "ok"']);
  });

  it("runs a planning turn and threads the plan into the write-back when enabled", async () => {
    const proposer = new FakeProposer();
    const captured: { options?: DriveOptions } = {};
    const deps: QaDeps = { drive: fakeDrive(captured), compiler: new FakeCompiler(), runner: new FakeRunner("passed"), proposer };
    await runQa(deps, {
      graph: GRAPH,
      startUrl: "http://x/",
      target: TARGET,
      n: 1,
      plan: true,
      propose: { targetPath: "rac/b.md" },
    });
    expect(captured.options?.plan).toBe(true);
    expect(proposer.input?.plan).toContain("Navigate to the page");
  });

  it("does not request a plan or thread one when planning is off", async () => {
    const proposer = new FakeProposer();
    const captured: { options?: DriveOptions } = {};
    const deps: QaDeps = { drive: fakeDrive(captured), compiler: new FakeCompiler(), runner: new FakeRunner("passed"), proposer };
    await runQa(deps, { graph: GRAPH, startUrl: "http://x/", target: TARGET, n: 1, propose: { targetPath: "rac/b.md" } });
    expect(captured.options?.plan).toBeUndefined();
    expect(proposer.input?.plan).toBeUndefined();
  });
});

describe("runQa — failure-learning", () => {
  it("records a failure when the test is unstable", async () => {
    const learning = new InMemoryLearningStore();
    const deps: QaDeps = { drive: fakeDrive({}), compiler: new FakeCompiler(), runner: new FakeRunner("failed"), learning };
    await runQa(deps, { graph: GRAPH, startUrl: "http://x/", target: TARGET, n: 2 });

    const failures = await learning.priorFailures("REQ-B");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toMatch(/unstable: 0\/2/);
  });

  it("feeds prior failure reasons into the next drive", async () => {
    const learning = new InMemoryLearningStore();
    await learning.recordFailure({ capabilityId: "REQ-B", reason: "the Verify button moved" });
    const captured: { options?: DriveOptions } = {};
    const deps: QaDeps = { drive: fakeDrive(captured), compiler: new FakeCompiler(), runner: new FakeRunner("passed"), learning };
    await runQa(deps, { graph: GRAPH, startUrl: "http://x/", target: TARGET, n: 1 });

    expect(captured.options?.priorFailures).toEqual(["the Verify button moved"]);
  });

  it("records nothing when the test is stable", async () => {
    const learning = new InMemoryLearningStore();
    const deps: QaDeps = { drive: fakeDrive({}), compiler: new FakeCompiler(), runner: new FakeRunner("passed"), learning };
    await runQa(deps, { graph: GRAPH, startUrl: "http://x/", target: TARGET, n: 1 });
    expect(await learning.priorFailures("REQ-B")).toEqual([]);
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

  it("defaults the trust boundary closed: no shell, no extra hosts", () => {
    const args = parseQaArgs(["--graph-file", "g.json", "--url", "http://x/"]);
    expect(args.allowShell).toBe(false);
    expect(args.allowedHosts).toEqual([]);
  });

  it("parses --allow-shell and repeatable --allow-host", () => {
    const args = parseQaArgs([
      "--graph-file", "g.json", "--url", "http://x/",
      "--allow-shell", "--allow-host", "api.example.com", "--allow-host", "cdn.example.com",
    ]);
    expect(args.allowShell).toBe(true);
    expect(args.allowedHosts).toEqual(["api.example.com", "cdn.example.com"]);
  });

  it("requires a value for --allow-host", () => {
    expect(() => parseQaArgs(["--graph-file", "g.json", "--url", "http://x/", "--allow-host"])).toThrow(
      /--allow-host/,
    );
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
