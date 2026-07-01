import { describe, expect, it } from "vitest";

import { GitHubRestGateway } from "../src/writeback/gateways/github-rest.js";
import { GitHubWriteBackProposer } from "../src/writeback/proposer.js";

/** A fetch double that records requests and replies from a route map. */
function fakeFetch(routes: Record<string, () => { status?: number; json?: unknown }>) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const impl = (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const key = `${method} ${url.replace("https://api.github.com", "")}`;
    const route = routes[key] ?? routes[`${method} *`];
    if (!route) throw new Error(`unexpected request: ${key}`);
    const { status = 200, json = {} } = route();
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(json),
      text: () => Promise.resolve(JSON.stringify(json)),
    } as Response);
  };
  return { impl, calls };
}

const ARTIFACT = "# Requirement: Login\n\n## Requirements\n\nUsers can log in.\n";

describe("GitHubRestGateway", () => {
  it("decodes file content from the contents API", async () => {
    const { impl } = fakeFetch({
      "GET /repos/o/r/contents/rac/x.md?ref=main": () => ({
        json: { content: Buffer.from(ARTIFACT, "utf8").toString("base64"), encoding: "base64" },
      }),
    });
    const gateway = new GitHubRestGateway({ owner: "o", repo: "r", token: "t", fetch: impl });
    expect(await gateway.getFileContent("rac/x.md", "main")).toBe(ARTIFACT);
  });

  it("drives a full proposal: read base, branch, commit to branch, open PR", async () => {
    const { impl, calls } = fakeFetch({
      "GET /repos/o/r/contents/rac/x.md?ref=main": () => ({
        json: { content: Buffer.from(ARTIFACT, "utf8").toString("base64"), encoding: "base64" },
      }),
      "GET /repos/o/r/git/ref/heads/main": () => ({ json: { object: { sha: "base-sha" } } }),
      "POST /repos/o/r/git/refs": () => ({ status: 201, json: {} }),
      // file does not exist yet on the new branch → 404, then PUT creates it
      "GET /repos/o/r/contents/rac/x.md?ref=proofkeeper/verified-by/req-login": () => ({ status: 404 }),
      "PUT /repos/o/r/contents/rac/x.md": () => ({ json: { commit: { sha: "c1" } } }),
      "POST /repos/o/r/pulls": () => ({
        status: 201,
        json: { html_url: "https://github.com/o/r/pull/12", number: 12 },
      }),
    });
    const gateway = new GitHubRestGateway({ owner: "o", repo: "r", token: "t", fetch: impl });
    const result = await new GitHubWriteBackProposer(gateway, { baseBranch: "main" }).propose({
      capabilityId: "REQ-LOGIN",
      targetPath: "rac/x.md",
      links: [{ test: "tests/e2e/login.spec.ts" }],
    });

    expect(result.status).toBe("proposed");
    if (result.status !== "proposed") throw new Error("expected proposed");
    expect(result.number).toBe(12);

    // The branch ref was created from main; the PUT (commit) targeted the new
    // branch, never main; the PR is head -> base.
    const refPost = calls.find((c) => c.method === "POST" && c.url.endsWith("/git/refs"));
    expect(refPost?.body).toMatchObject({ ref: "refs/heads/proofkeeper/verified-by/req-login", sha: "base-sha" });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toMatchObject({ branch: "proofkeeper/verified-by/req-login" });
    expect(put?.body).not.toMatchObject({ branch: "main" });
    const prPost = calls.find((c) => c.url.endsWith("/pulls"));
    expect(prPost?.body).toMatchObject({ base: "main", head: "proofkeeper/verified-by/req-login" });
  });

  it("posts a PR comment via the issues comments endpoint", async () => {
    const { impl, calls } = fakeFetch({
      "POST /repos/o/r/issues/12/comments": () => ({
        status: 201,
        json: { html_url: "https://github.com/o/r/pull/12#issuecomment-1" },
      }),
    });
    const gateway = new GitHubRestGateway({ owner: "o", repo: "r", token: "t", fetch: impl });
    const result = await gateway.commentOnPullRequest({ number: 12, body: "hello" });
    expect(result.url).toContain("#issuecomment-1");
    expect(calls[0]?.body).toMatchObject({ body: "hello" });
  });

  it("lists PR comments (id + body) via the issues comments endpoint", async () => {
    const { impl } = fakeFetch({
      "GET /repos/o/r/issues/12/comments?per_page=100&page=1": () => ({
        json: [
          { id: 1, body: "hi" },
          { id: 2, body: "<!-- proofkeeper:scoped-qa -->\nstatus" },
        ],
      }),
    });
    const gateway = new GitHubRestGateway({ owner: "o", repo: "r", token: "t", fetch: impl });
    const comments = await gateway.listComments(12);
    expect(comments).toEqual([
      { id: 1, body: "hi" },
      { id: 2, body: "<!-- proofkeeper:scoped-qa -->\nstatus" },
    ]);
  });

  it("updates a comment in place via PATCH", async () => {
    const { impl, calls } = fakeFetch({
      "PATCH /repos/o/r/issues/comments/2": () => ({
        json: { html_url: "https://github.com/o/r/pull/12#issuecomment-2" },
      }),
    });
    const gateway = new GitHubRestGateway({ owner: "o", repo: "r", token: "t", fetch: impl });
    const result = await gateway.updateComment(2, "new body");
    expect(result.url).toContain("#issuecomment-2");
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.body).toMatchObject({ body: "new body" });
  });

  it("raises a clear error on a failed request", async () => {
    const { impl } = fakeFetch({ "GET *": () => ({ status: 403, json: { message: "forbidden" } }) });
    const gateway = new GitHubRestGateway({ owner: "o", repo: "r", token: "t", fetch: impl });
    await expect(gateway.getFileContent("x", "main")).rejects.toThrow(/403/);
  });
});

describe("GitHubRestGateway — re-run idempotency", () => {
  it("re-points an already-existing head branch instead of failing with 422", async () => {
    const { impl, calls } = fakeFetch({
      "GET /repos/o/r/git/ref/heads/main": () => ({ json: { object: { sha: "abc" } } }),
      "POST /repos/o/r/git/refs": () => ({ status: 422, json: { message: "Reference already exists" } }),
      "PATCH /repos/o/r/git/refs/heads/proofkeeper/verified-by/req-b": () => ({ json: {} }),
    });
    const gateway = new GitHubRestGateway({ owner: "o", repo: "r", token: "t", fetch: impl });
    await gateway.createBranch("proofkeeper/verified-by/req-b", "main");
    expect(calls.some((c) => c.method === "PATCH" && c.url.includes("/git/refs/heads/"))).toBe(true);
  });

  it("returns the existing open PR when one is already open for the head branch", async () => {
    const { impl } = fakeFetch({
      "POST /repos/o/r/pulls": () => ({ status: 422, json: { message: "A pull request already exists for o:h." } }),
      "GET /repos/o/r/pulls?head=o%3Ah&state=open&per_page=1": () => ({
        json: [{ html_url: "https://gh/pull/7", number: 7 }],
      }),
    });
    const gateway = new GitHubRestGateway({ owner: "o", repo: "r", token: "t", fetch: impl });
    const pr = await gateway.openPullRequest({ base: "main", head: "h", title: "t", body: "b" });
    expect(pr).toEqual({ url: "https://gh/pull/7", number: 7 });
  });

  it("paginates comment listing past the first hundred", async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, body: `c${i + 1}` }));
    const { impl } = fakeFetch({
      "GET /repos/o/r/issues/9/comments?per_page=100&page=1": () => ({ json: first }),
      "GET /repos/o/r/issues/9/comments?per_page=100&page=2": () => ({
        json: [{ id: 101, body: "<!-- proofkeeper:scoped-qa -->\nmarked" }],
      }),
    });
    const gateway = new GitHubRestGateway({ owner: "o", repo: "r", token: "t", fetch: impl });
    const comments = await gateway.listComments(9);
    expect(comments).toHaveLength(101);
    expect(comments.at(-1)?.body).toContain("proofkeeper:scoped-qa");
  });
});
