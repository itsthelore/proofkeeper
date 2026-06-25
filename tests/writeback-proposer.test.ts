import { describe, expect, it } from "vitest";

import { buildProposal, linksFromResults } from "../src/writeback/proposal.js";
import { GitHubWriteBackProposer, type RepoGateway } from "../src/writeback/proposer.js";
import type { CandidateTest } from "../src/compiler/types.js";
import type { RunResult } from "../src/runner/types.js";
import type { RecordedSession } from "../src/compiler/actions.js";

const ARTIFACT = `# Requirement: Login\n\n## Requirements\n\nUsers can log in.\n\n## Related Decisions\n\n- adr-001\n`;

describe("buildProposal", () => {
  it("produces a changed proposal with branch, title, and review-oriented body", () => {
    const p = buildProposal({
      capabilityId: "REQ-LOGIN",
      targetPath: "rac/requirements/login.md",
      originalContent: ARTIFACT,
      links: [{ test: "tests/e2e/login.spec.ts", trace: "traces/login.zip" }],
    });
    expect(p.changed).toBe(true);
    expect(p.baseBranch).toBe("main");
    expect(p.headBranch).toBe("proofkeeper/verified-by/req-login");
    expect(p.title).toBe("docs(verify): record Verified By for REQ-LOGIN");
    expect(p.updatedContent).toContain("## Verified By");
    expect(p.body).toContain("`tests/e2e/login.spec.ts`");
    expect(p.body).toContain("human review");
  });

  it("reports changed:false when every link is already present", () => {
    const first = buildProposal({
      capabilityId: "REQ-LOGIN",
      targetPath: "x.md",
      originalContent: ARTIFACT,
      links: [{ test: "a.spec.ts" }],
    });
    const again = buildProposal({
      capabilityId: "REQ-LOGIN",
      targetPath: "x.md",
      originalContent: first.updatedContent,
      links: [{ test: "a.spec.ts" }],
    });
    expect(again.changed).toBe(false);
  });
});

describe("linksFromResults", () => {
  it("links the committed spec to its first replayable trace", () => {
    const candidate: CandidateTest = {
      id: "seed",
      specPath: "examples/generated/seed.spec.ts",
      title: "verify flow",
      fromSession: { title: "verify flow", startUrl: "http://x/", actions: [] },
    };
    const results: RunResult[] = [
      { testId: "seed", target: "dev", status: "passed", durationMs: 10, tracePath: "test-results/seed/trace.zip" },
    ];
    expect(linksFromResults(candidate, results)).toEqual([
      { test: "examples/generated/seed.spec.ts", trace: "test-results/seed/trace.zip" },
    ]);
  });
});

/** Records every gateway call so tests can assert the base branch is never written. */
class FakeGateway implements RepoGateway {
  calls: string[] = [];
  branches: string[] = [];
  commits: { branch: string; path: string }[] = [];
  prs: { base: string; head: string }[] = [];
  comments: { number: number; body: string }[] = [];
  constructor(private readonly fileContent: string) {}

  getFileContent(path: string, ref: string): Promise<string> {
    this.calls.push(`get ${path}@${ref}`);
    return Promise.resolve(this.fileContent);
  }
  createBranch(name: string, fromRef: string): Promise<void> {
    this.calls.push(`branch ${name}<-${fromRef}`);
    this.branches.push(name);
    return Promise.resolve();
  }
  commitFile(input: { branch: string; path: string; content: string; message: string }): Promise<void> {
    this.calls.push(`commit ${input.path}@${input.branch}`);
    this.commits.push({ branch: input.branch, path: input.path });
    return Promise.resolve();
  }
  openPullRequest(input: { base: string; head: string }): Promise<{ url: string; number: number }> {
    this.calls.push(`pr ${input.head}->${input.base}`);
    this.prs.push({ base: input.base, head: input.head });
    return Promise.resolve({ url: "https://github.com/itsthelore/x/pull/7", number: 7 });
  }
  commentOnPullRequest(input: { number: number; body: string }): Promise<{ url: string }> {
    this.calls.push(`comment #${input.number}`);
    this.comments.push({ number: input.number, body: input.body });
    return Promise.resolve({ url: `https://github.com/itsthelore/x/pull/${input.number}#comment-1` });
  }
}

describe("GitHubWriteBackProposer", () => {
  const input = {
    capabilityId: "REQ-LOGIN",
    targetPath: "rac/requirements/login.md",
    links: [{ test: "tests/e2e/login.spec.ts" }],
  };

  it("branches from base, commits only to the head branch, and opens a PR base<-head", async () => {
    const gateway = new FakeGateway(ARTIFACT);
    const result = await new GitHubWriteBackProposer(gateway, { baseBranch: "main" }).propose(input);

    expect(result.status).toBe("proposed");
    if (result.status !== "proposed") throw new Error("expected proposed");
    expect(result.headBranch).toBe("proofkeeper/verified-by/req-login");
    expect(result.url).toContain("/pull/7");

    // The base branch is NEVER committed to — the structural ADR-065 guarantee.
    expect(gateway.commits.every((c) => c.branch !== "main")).toBe(true);
    expect(gateway.commits).toEqual([{ branch: "proofkeeper/verified-by/req-login", path: input.targetPath }]);
    expect(gateway.prs).toEqual([{ base: "main", head: "proofkeeper/verified-by/req-login" }]);
    // Order: read base, branch, commit, PR.
    expect(gateway.calls).toEqual([
      "get rac/requirements/login.md@main",
      "branch proofkeeper/verified-by/req-login<-main",
      "commit rac/requirements/login.md@proofkeeper/verified-by/req-login",
      "pr proofkeeper/verified-by/req-login->main",
    ]);
  });

  it("posts a fidelity confirmation comment only when a fidelity result is given", async () => {
    const withFidelity = new FakeGateway(ARTIFACT);
    const r1 = await new GitHubWriteBackProposer(withFidelity).propose({
      ...input,
      fidelity: { attempts: 3, passed: 3, stable: true },
    });
    expect(r1.status).toBe("proposed");
    if (r1.status !== "proposed") throw new Error("expected proposed");
    expect(r1.commentUrl).toContain("#comment-1");
    expect(withFidelity.comments).toHaveLength(1);
    expect(withFidelity.comments[0]!.body).toContain("3/3 re-runs green");

    const noFidelity = new FakeGateway(ARTIFACT);
    const r2 = await new GitHubWriteBackProposer(noFidelity).propose(input);
    expect(r2.status === "proposed" && r2.commentUrl).toBeUndefined();
    expect(noFidelity.comments).toEqual([]);
  });

  it("posts a step-summary comment when a recorded session is supplied (no fidelity)", async () => {
    const session: RecordedSession = {
      capabilityId: "REQ-LOGIN",
      title: "login flow",
      startUrl: "http://localhost/",
      actions: [
        { type: "goto", url: "http://localhost/" },
        { type: "click", locator: { kind: "role", role: "button", name: "Log in" } },
      ],
    };
    const gateway = new FakeGateway(ARTIFACT);
    const result = await new GitHubWriteBackProposer(gateway).propose({ ...input, session });

    expect(result.status === "proposed" && result.commentUrl).toBeTruthy();
    expect(gateway.comments).toHaveLength(1);
    expect(gateway.comments[0]!.body).toContain("Steps exercised:");
    expect(gateway.comments[0]!.body).toContain('Click the button "Log in"');
    expect(gateway.comments[0]!.body).not.toContain("Fidelity gate");
  });

  it("opens no PR and writes nothing when the link is already present", async () => {
    const withLink = ARTIFACT + "\n## Verified By\n\n- `tests/e2e/login.spec.ts`\n";
    const gateway = new FakeGateway(withLink);
    const result = await new GitHubWriteBackProposer(gateway).propose(input);

    expect(result.status).toBe("no-change");
    expect(gateway.branches).toEqual([]);
    expect(gateway.commits).toEqual([]);
    expect(gateway.prs).toEqual([]);
  });
});
