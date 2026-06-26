import { describe, expect, it, vi } from "vitest";

import {
  renderWriteBackComment,
  renderCoverageComment,
  commentCoverageStatus,
  upsertComment,
  SCOPED_QA_MARKER,
  COVERAGE_MARKER,
} from "../src/writeback/comment.js";
import type { CoverageReport } from "../src/coverage/model.js";
import type { RepoGateway } from "../src/writeback/proposer.js";

describe("renderWriteBackComment", () => {
  it("lists the linked evidence and the fidelity result", () => {
    const body = renderWriteBackComment({
      capabilityId: "REQ-LOGIN",
      links: [{ test: "tests/login.spec.ts", trace: "traces/login.zip" }],
      fidelity: { attempts: 5, passed: 5, stable: true },
    });
    expect(body).toContain("**REQ-LOGIN**");
    expect(body).toContain("- `tests/login.spec.ts` (trace: `traces/login.zip`)");
    expect(body).toContain("5/5 re-runs green — stable");
    expect(body).toContain("does not merge or approve");
  });

  it("omits the fidelity line when no result is given", () => {
    const body = renderWriteBackComment({ capabilityId: "REQ-X", links: [{ test: "t.spec.ts" }] });
    expect(body).not.toContain("Fidelity gate");
  });

  it("marks an unstable result as quarantined", () => {
    const body = renderWriteBackComment({
      capabilityId: "REQ-X",
      links: [{ test: "t.spec.ts" }],
      fidelity: { attempts: 3, passed: 2, stable: false },
    });
    expect(body).toContain("2/3 re-runs green — unstable, quarantined");
  });

  it("renders the step summary and a trace-replay hint", () => {
    const body = renderWriteBackComment({
      capabilityId: "REQ-X",
      links: [{ test: "t.spec.ts", trace: "traces/x.zip" }],
      steps: ["Navigate to http://x/", "Click the button \"Verify\""],
    });
    expect(body).toContain("Steps exercised:");
    expect(body).toContain("1. Navigate to http://x/");
    expect(body).toContain('2. Click the button "Verify"');
    expect(body).toContain("Replay the trace locally: `npx playwright show-trace traces/x.zip`");
  });

  it("omits the trace-replay hint when no link has a trace", () => {
    const body = renderWriteBackComment({ capabilityId: "REQ-X", links: [{ test: "t.spec.ts" }] });
    expect(body).not.toContain("show-trace");
  });

  it("renders the test plan when present", () => {
    const body = renderWriteBackComment({
      capabilityId: "REQ-X",
      links: [{ test: "t.spec.ts" }],
      plan: "1. Open the page\n2. Verify the status",
    });
    expect(body).toContain("Test plan:");
    expect(body).toContain("1. Open the page");
  });
});

const REPORT: CoverageReport = {
  source: "demo",
  total: 2,
  verified: [{ id: "REQ-A", title: "Cap A", status: "Accepted", verifiedBy: ["tests/a.spec.ts"] }],
  unverified: [{ id: "REQ-B", title: "Cap B", status: "Proposed", verifiedBy: [] }],
};

describe("renderCoverageComment", () => {
  it("summarizes verified and unverified capabilities", () => {
    const body = renderCoverageComment(REPORT);
    expect(body).toContain("## Proofkeeper verification coverage for `demo`");
    expect(body).toContain("1/2 capabilities have a verifying test; 1 unverified.");
    expect(body).toContain("**REQ-A** — Cap A: `tests/a.spec.ts`");
    expect(body).toContain("- REQ-B — Cap B");
  });

  it("honors a title override", () => {
    expect(renderCoverageComment(REPORT, { title: "Verification status" })).toContain(
      "## Verification status for `demo`",
    );
  });
});

describe("commentCoverageStatus", () => {
  it("creates the coverage comment when none exists yet", async () => {
    const commentOnPullRequest = vi.fn().mockResolvedValue({ url: "https://x/pull/9#c" });
    const listComments = vi.fn().mockResolvedValue([]);
    const updateComment = vi.fn();
    const gateway = { commentOnPullRequest, listComments, updateComment } as unknown as RepoGateway;

    const result = await commentCoverageStatus(gateway, { prNumber: 9, report: REPORT });

    expect(result.updated).toBe(false);
    expect(result.url).toContain("#c");
    expect(updateComment).not.toHaveBeenCalled();
    const arg = commentOnPullRequest.mock.calls[0][0];
    expect(arg.number).toBe(9);
    expect(arg.body).toContain("1/2 capabilities have a verifying test");
    expect(arg.body).toContain(COVERAGE_MARKER);
  });
});

describe("upsertComment", () => {
  it("updates the existing marked comment in place instead of creating a new one", async () => {
    const listComments = vi.fn().mockResolvedValue([
      { id: 11, body: "unrelated" },
      { id: 22, body: `${SCOPED_QA_MARKER}\n## old status` },
    ]);
    const updateComment = vi.fn().mockResolvedValue({ url: "https://x/pull/3#c-22" });
    const commentOnPullRequest = vi.fn();
    const gateway = { listComments, updateComment, commentOnPullRequest } as unknown as RepoGateway;

    const result = await upsertComment(gateway, { number: 3, marker: SCOPED_QA_MARKER, body: `${SCOPED_QA_MARKER}\n## new status` });

    expect(result.updated).toBe(true);
    expect(updateComment).toHaveBeenCalledWith(22, `${SCOPED_QA_MARKER}\n## new status`);
    expect(commentOnPullRequest).not.toHaveBeenCalled();
  });

  it("creates a new comment when no marked comment is present", async () => {
    const listComments = vi.fn().mockResolvedValue([{ id: 11, body: "unrelated" }]);
    const updateComment = vi.fn();
    const commentOnPullRequest = vi.fn().mockResolvedValue({ url: "https://x/pull/3#c-new" });
    const gateway = { listComments, updateComment, commentOnPullRequest } as unknown as RepoGateway;

    const result = await upsertComment(gateway, { number: 3, marker: SCOPED_QA_MARKER, body: "x" });

    expect(result.updated).toBe(false);
    expect(commentOnPullRequest).toHaveBeenCalledOnce();
    expect(updateComment).not.toHaveBeenCalled();
  });
});
