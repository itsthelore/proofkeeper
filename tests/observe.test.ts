import { describe, expect, it } from "vitest";
import type { ConsoleMessage, Page, Response } from "@playwright/test";

import { renderObservation, createPageMonitor } from "../src/agent/observe.js";

describe("renderObservation", () => {
  it("renders console and network blocks when present", () => {
    const out = renderObservation({
      url: "http://x/",
      title: "T",
      text: "hi",
      aria: "- button",
      console: ["[error] boom"],
      network: ["200 GET http://x/api"],
    });
    expect(out).toContain("Console:\n[error] boom");
    expect(out).toContain("Network:\n200 GET http://x/api");
  });

  it("omits the console/network blocks when absent or empty", () => {
    const base = { url: "http://x/", title: "T", text: "hi", aria: "" };
    expect(renderObservation(base)).not.toContain("Console:");
    expect(renderObservation({ ...base, console: [], network: [] })).not.toContain("Network:");
  });
});

/** A fake Page capturing on/off handlers so events can be emitted by hand. */
function fakePage() {
  const handlers: Record<string, Array<(arg: unknown) => void>> = {};
  const page = {
    on: (event: string, handler: (arg: unknown) => void) => {
      (handlers[event] ??= []).push(handler);
    },
    off: (event: string, handler: (arg: unknown) => void) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
    },
  } as unknown as Page;
  return {
    page,
    emit: (event: string, arg: unknown) => (handlers[event] ?? []).forEach((h) => h(arg)),
    count: (event: string) => (handlers[event] ?? []).length,
  };
}

const consoleMsg = (type: string, text: string) => ({ type: () => type, text: () => text }) as unknown as ConsoleMessage;
const response = (status: number, method: string, url: string) =>
  ({ status: () => status, url: () => url, request: () => ({ method: () => method }) }) as unknown as Response;

describe("createPageMonitor", () => {
  it("captures console messages and network responses", () => {
    const { page, emit } = fakePage();
    const monitor = createPageMonitor(page);
    emit("console", consoleMsg("error", "boom"));
    emit("response", response(200, "GET", "http://x/api"));
    expect(monitor.console).toEqual(["[error] boom"]);
    expect(monitor.network).toEqual(["200 GET http://x/api"]);
  });

  it("bounds each buffer to the recent window", () => {
    const { page, emit } = fakePage();
    const monitor = createPageMonitor(page, { limit: 2 });
    for (let i = 0; i < 4; i++) emit("console", consoleMsg("log", `m${i}`));
    expect(monitor.console).toEqual(["[log] m2", "[log] m3"]);
  });

  it("removes its listeners on dispose", () => {
    const { page, emit, count } = fakePage();
    const monitor = createPageMonitor(page);
    expect(count("console")).toBe(1);
    monitor.dispose();
    expect(count("console")).toBe(0);
    emit("console", consoleMsg("log", "after"));
    expect(monitor.console).toEqual([]);
  });
});

describe("observation budget", () => {
  it("clips oversized text and ARIA blocks with a truncation marker", () => {
    const rendered = renderObservation({
      url: "http://x/",
      title: "t",
      text: "a".repeat(9000),
      aria: "b".repeat(8100),
    });
    expect(rendered).toContain("… [truncated 1000 chars]");
    expect(rendered).toContain("… [truncated 100 chars]");
    // Bounded: nowhere near the raw 17k of input.
    expect(rendered.length).toBeLessThan(17000);
  });

  it("leaves small observations untouched", () => {
    const rendered = renderObservation({ url: "http://x/", title: "t", text: "hello", aria: "- doc" });
    expect(rendered).not.toContain("truncated");
  });
});
