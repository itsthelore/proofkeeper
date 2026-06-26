import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";

import { Recorder } from "../src/compiler/recorder.js";

/**
 * The HTTP half of the recorder issues real requests via fetch and never touches
 * the page, so these are hermetic (a tiny local server, no browser) and run under
 * `npm test`. The page is a stub that would throw if any browser method were used.
 */
function httpRecorder(): Recorder {
  return new Recorder({} as unknown as Page, { title: "api check", startUrl: "about:blank" });
}

let server: Server;
let baseURL: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/order") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: { id: 7, status: "paid" } }));
    } else if (req.url === "/missing") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } else if (req.url === "/text") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("not json");
    } else {
      res.writeHead(200);
      res.end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (typeof addr === "string" || addr === null) throw new Error("no server address");
  baseURL = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Recorder — HTTP actions", () => {
  it("issues a request, records it, and returns the response", async () => {
    const rec = httpRecorder();
    const res = await rec.request({ method: "GET", url: `${baseURL}/order` });
    expect(res.status).toBe(200);
    expect(rec.recording().actions[0]).toEqual({ type: "request", method: "GET", url: `${baseURL}/order` });
  });

  it("asserts and records a status, and rejects a mismatch", async () => {
    const rec = httpRecorder();
    await rec.request({ method: "GET", url: `${baseURL}/missing` });
    await expect(rec.expectStatus(200)).rejects.toThrow(/status assertion failed/);
    await rec.expectStatus(404);
    expect(rec.recording().actions.at(-1)).toEqual({ type: "expectStatus", status: 404 });
  });

  it("asserts and records a JSON field at a dot-path", async () => {
    const rec = httpRecorder();
    await rec.request({ method: "GET", url: `${baseURL}/order` });
    await rec.expectJson("data.id", 7);
    await rec.expectJson("data.status", "paid");
    expect(rec.recording().actions.filter((a) => a.type === "expectJson")).toHaveLength(2);
  });

  it("rejects and does not record a failing JSON assertion", async () => {
    const rec = httpRecorder();
    await rec.request({ method: "GET", url: `${baseURL}/order` });
    await expect(rec.expectJson("data.id", 8)).rejects.toThrow(/json assertion failed/);
    expect(rec.recording().actions.some((a) => a.type === "expectJson")).toBe(false);
  });

  it("rejects a JSON assertion on a non-JSON body", async () => {
    const rec = httpRecorder();
    await rec.request({ method: "GET", url: `${baseURL}/text` });
    await expect(rec.expectJson("x", "y")).rejects.toThrow(/not valid JSON/);
  });

  it("refuses an assertion before any request has been issued", async () => {
    const rec = httpRecorder();
    await expect(rec.expectStatus(200)).rejects.toThrow(/before any request/);
    await expect(rec.expectJson("x", 1)).rejects.toThrow(/before any request/);
  });
});
