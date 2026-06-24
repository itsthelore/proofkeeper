/**
 * A concrete {@link RepoGateway} over the GitHub REST API — Proofkeeper
 * Initiative 5.
 *
 * Dependency-free: it uses the global `fetch` (Node ≥ 20), so wiring the
 * write-back to GitHub needs no SDK. `fetch` is injectable for testing. A token
 * with `contents:write` + `pull_requests:write` on the target repo is required.
 *
 * It only ever branches, commits to that branch, and opens a pull request — it
 * never writes the base branch (the proposer relies on that; this gateway
 * exposes no base-write path either). The trust boundary stays human PR review
 * (ADR-065).
 */

import type { RepoGateway } from "../proposer.js";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface GitHubRestGatewayOptions {
  owner: string;
  repo: string;
  /** Token with contents:write and pull_requests:write on the repo. */
  token: string;
  /** Override for testing or GitHub Enterprise. Defaults to api.github.com. */
  fetch?: FetchLike;
  baseUrl?: string;
}

export class GitHubRestGateway implements RepoGateway {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(options: GitHubRestGatewayOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.token = options.token;
    this.fetchImpl = options.fetch ?? (globalThis.fetch as FetchLike);
    this.baseUrl = options.baseUrl ?? "https://api.github.com";
    if (!this.fetchImpl) {
      throw new Error("GitHubRestGateway needs a fetch implementation (Node >= 20 or inject one).");
    }
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      throw new Error(`GitHub ${method} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.status === 204 ? undefined : ((await res.json()) as unknown);
  }

  private repoPath(suffix: string): string {
    return `/repos/${this.owner}/${this.repo}${suffix}`;
  }

  async getFileContent(path: string, ref: string): Promise<string> {
    const data = (await this.request(
      "GET",
      this.repoPath(`/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref)}`),
    )) as { content?: string; encoding?: string };
    if (typeof data.content !== "string") {
      throw new Error(`no file content at ${path}@${ref}`);
    }
    return Buffer.from(data.content, (data.encoding as BufferEncoding) ?? "base64").toString("utf8");
  }

  async createBranch(name: string, fromRef: string): Promise<void> {
    const ref = (await this.request("GET", this.repoPath(`/git/ref/heads/${fromRef}`))) as {
      object: { sha: string };
    };
    await this.request("POST", this.repoPath("/git/refs"), {
      ref: `refs/heads/${name}`,
      sha: ref.object.sha,
    });
  }

  async commitFile(input: { branch: string; path: string; content: string; message: string }): Promise<void> {
    // Look up the file's blob sha on the branch (required to update an existing file).
    let sha: string | undefined;
    try {
      const existing = (await this.request(
        "GET",
        this.repoPath(`/contents/${encodeURIComponent(input.path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(input.branch)}`),
      )) as { sha?: string };
      sha = existing.sha;
    } catch {
      sha = undefined; // new file
    }
    await this.request("PUT", this.repoPath(`/contents/${encodeURIComponent(input.path).replace(/%2F/g, "/")}`), {
      message: input.message,
      content: Buffer.from(input.content, "utf8").toString("base64"),
      branch: input.branch,
      ...(sha ? { sha } : {}),
    });
  }

  async openPullRequest(input: { base: string; head: string; title: string; body: string }): Promise<{
    url: string;
    number: number;
  }> {
    const pr = (await this.request("POST", this.repoPath("/pulls"), {
      title: input.title,
      head: input.head,
      base: input.base,
      body: input.body,
    })) as { html_url: string; number: number };
    return { url: pr.html_url, number: pr.number };
  }
}
