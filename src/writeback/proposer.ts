/**
 * Propose a `## Verified By` write-back as a human-reviewed pull request —
 * Proofkeeper Initiative 5.
 *
 * The trust boundary is human PR review (ADR-065): Proofkeeper NEVER commits to
 * the base branch. The proposer reads the target file from the base, builds the
 * merged content, commits it to a NEW head branch, and opens a pull request
 * base ← head. That guarantee is structural — there is no code path that writes
 * to the base branch.
 *
 * Repository operations go through an injected {@link RepoGateway}, so there is
 * no hard GitHub dependency: wire it to Octokit, the `gh` CLI, or a GitHub MCP
 * client. The mapping is the consumer's choice, exactly like the model adapter.
 */

import { buildProposal } from "./proposal.js";
import { renderWriteBackComment, upsertComment, WRITE_BACK_MARKER, type FidelitySummary } from "./comment.js";
import type { VerificationLink } from "./verified-by.js";

/** The repository operations the proposer needs. Implement against any backend. */
export interface RepoGateway {
  /** Read a file's content at a ref (branch/sha). */
  getFileContent(path: string, ref: string): Promise<string>;
  /** Create a new branch from a base ref. */
  createBranch(name: string, fromRef: string): Promise<void>;
  /** Commit file content to a branch (never the base — the proposer enforces this). */
  commitFile(input: { branch: string; path: string; content: string; message: string }): Promise<void>;
  /** Open a pull request from `head` into `base`. */
  openPullRequest(input: { base: string; head: string; title: string; body: string }): Promise<{
    url: string;
    number: number;
  }>;
  /** Post an informational comment on a pull request. Never approves or merges. */
  commentOnPullRequest(input: { number: number; body: string }): Promise<{ url: string }>;
  /** List a pull request's comments (id + body), for find-or-update of a marked comment. */
  listComments(prNumber: number): Promise<{ id: number; body: string }[]>;
  /** Update a comment's body in place. */
  updateComment(commentId: number, body: string): Promise<{ url: string }>;
}

export interface WriteBackInput {
  capabilityId: string;
  targetPath: string;
  links: VerificationLink[];
  /** Overrides the proposer's default base branch. */
  baseBranch?: string;
  branchPrefix?: string;
  /** When provided, a confirmation comment with the fidelity result is posted on the PR. */
  fidelity?: FidelitySummary;
  /** Readable step summary of the driven flow, shown in the PR body and comment. */
  steps?: string[];
}

export type WriteBackResult =
  | { status: "no-change"; reason: string }
  | { status: "proposed"; url: string; number: number; headBranch: string; commentUrl?: string };

export interface WriteBackProposer {
  propose(input: WriteBackInput): Promise<WriteBackResult>;
}

export interface GitHubWriteBackProposerOptions {
  /** Base branch PRs target. Defaults to `main`. */
  baseBranch?: string;
}

export class GitHubWriteBackProposer implements WriteBackProposer {
  constructor(
    private readonly gateway: RepoGateway,
    private readonly options: GitHubWriteBackProposerOptions = {},
  ) {}

  async propose(input: WriteBackInput): Promise<WriteBackResult> {
    const baseBranch = input.baseBranch ?? this.options.baseBranch ?? "main";

    const originalContent = await this.gateway.getFileContent(input.targetPath, baseBranch);
    const proposal = buildProposal({
      capabilityId: input.capabilityId,
      targetPath: input.targetPath,
      originalContent,
      links: input.links,
      baseBranch,
      ...(input.branchPrefix !== undefined ? { branchPrefix: input.branchPrefix } : {}),
      ...(input.steps !== undefined ? { steps: input.steps } : {}),
    });

    if (!proposal.changed) {
      return { status: "no-change", reason: "all proposed links are already present" };
    }

    // Commit ONLY to the new head branch, then open a PR. The base is never written.
    await this.gateway.createBranch(proposal.headBranch, baseBranch);
    await this.gateway.commitFile({
      branch: proposal.headBranch,
      path: input.targetPath,
      content: proposal.updatedContent,
      message: proposal.title,
    });
    const pr = await this.gateway.openPullRequest({
      base: baseBranch,
      head: proposal.headBranch,
      title: proposal.title,
      body: proposal.body,
    });

    const result: WriteBackResult = {
      status: "proposed",
      url: pr.url,
      number: pr.number,
      headBranch: proposal.headBranch,
    };

    // Optional confirmation comment carrying the fidelity evidence the PR body
    // does not. Informational only, and idempotent (one per PR, updated in place).
    if (input.fidelity) {
      const comment = await upsertComment(this.gateway, {
        number: pr.number,
        marker: WRITE_BACK_MARKER,
        body: renderWriteBackComment({
          capabilityId: input.capabilityId,
          links: input.links,
          fidelity: input.fidelity,
          ...(input.steps !== undefined ? { steps: input.steps } : {}),
        }),
      });
      result.commentUrl = comment.url;
    }

    return result;
  }
}
