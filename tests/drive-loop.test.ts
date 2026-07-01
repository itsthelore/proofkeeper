/**
 * The drive loop's control logic, unit-tested with a fake page and scripted
 * models — no browser. Pins the semantics the product promise rests on:
 * "finished" means the model called `finish` (a give-up is never completion),
 * the step budget is honoured, and the trust boundary shapes both the
 * advertised tools and dispatch.
 */

import { describe, it, expect } from "vitest";
import type { Page } from "@playwright/test";

import { AutonomousDriver } from "../src/agent/drive.js";
import type { ModelClient, ModelRequest, ModelResponse } from "../src/agent/model.js";
import { SHELL_TOOL_NAMES } from "../src/agent/policy.js";

/** A page double good enough for goto + observation; locators never resolve. */
function fakePage(): Page {
  const body = {
    innerText: () => Promise.resolve("Fake page body"),
    ariaSnapshot: () => Promise.resolve("- document"),
  };
  return {
    goto: () => Promise.resolve(null),
    url: () => "http://x/",
    title: () => Promise.resolve("Fake"),
    locator: () => body,
    on: () => undefined,
    off: () => undefined,
  } as unknown as Page;
}

/** A model that replays a fixed sequence of responses, capturing each request. */
class ScriptedModel implements ModelClient {
  requests: ModelRequest[] = [];
  private turn = 0;
  constructor(private readonly responses: ModelResponse[]) {}
  complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const response = this.responses[Math.min(this.turn, this.responses.length - 1)];
    this.turn++;
    return Promise.resolve(response ?? { done: "" });
  }
}

const OPTIONS = { title: "t", startUrl: "http://x/", goal: "verify the thing" };

/** All user-role feedback in a request's transcript (the array is shared/mutable). */
function userMessages(request: ModelRequest): string {
  return request.transcript
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
}

describe("drive finished semantics", () => {
  it("a no-tool-call turn is a give-up, never completion", async () => {
    const model = new ScriptedModel([{ done: "I cannot find the button, giving up." }]);
    const result = await new AutonomousDriver(fakePage(), model, OPTIONS).drive();

    expect(result.finished).toBe(false);
    expect(result.stopReason).toBe("gave_up");
    expect(result.gaveUpText).toBe("I cannot find the button, giving up.");
    expect(result.steps).toBe(1);
  });

  it("an explicit finish call is the only completion", async () => {
    const model = new ScriptedModel([{ toolCalls: [{ name: "finish", arguments: {} }] }]);
    const result = await new AutonomousDriver(fakePage(), model, OPTIONS).drive();

    expect(result.finished).toBe(true);
    expect(result.stopReason).toBe("finished");
    expect(result.gaveUpText).toBeUndefined();
  });

  it("exhausting the step budget reports step_budget", async () => {
    // A model that keeps issuing a (refused) navigate forever.
    const model = new ScriptedModel([
      { toolCalls: [{ name: "navigate", arguments: { url: "https://elsewhere.example/" } }] },
    ]);
    const result = await new AutonomousDriver(fakePage(), model, { ...OPTIONS, maxSteps: 3 }).drive();

    expect(result.finished).toBe(false);
    expect(result.stopReason).toBe("step_budget");
    expect(result.steps).toBe(3);
  });
});

describe("drive trust boundary in the loop", () => {
  it("never advertises the terminal tools without allowShell, and refuses a run_command", async () => {
    const model = new ScriptedModel([
      { toolCalls: [{ name: "run_command", arguments: { command: "cat /etc/passwd" } }] },
      { done: "stopping" },
    ]);
    await new AutonomousDriver(fakePage(), model, { ...OPTIONS, maxSteps: 2 }).drive();

    for (const request of model.requests) {
      const names = request.tools.map((t) => t.name);
      for (const shellTool of SHELL_TOOL_NAMES) expect(names).not.toContain(shellTool);
    }
    // The refusal came back as a failed action, naming the opt-in.
    const feedback = userMessages(model.requests.at(-1)!);
    expect(feedback).toContain("ERROR run_command");
    expect(feedback).toContain("--allow-shell");
  });

  it("advertises the full catalog with allowShell", async () => {
    const model = new ScriptedModel([{ toolCalls: [{ name: "finish", arguments: {} }] }]);
    await new AutonomousDriver(fakePage(), model, { ...OPTIONS, allowShell: true }).drive();

    const names = model.requests[0]!.tools.map((t) => t.name);
    for (const shellTool of SHELL_TOOL_NAMES) expect(names).toContain(shellTool);
  });

  it("refuses navigate to a non-allowlisted origin and feeds the reason back", async () => {
    const model = new ScriptedModel([
      { toolCalls: [{ name: "navigate", arguments: { url: "http://169.254.169.254/latest/" } }] },
      { toolCalls: [{ name: "finish", arguments: {} }] },
    ]);
    const result = await new AutonomousDriver(fakePage(), model, OPTIONS).drive();

    const feedback = userMessages(model.requests.at(-1)!);
    expect(feedback).toContain("ERROR navigate");
    expect(feedback).toContain("not allowed");
    // The refused navigation was never recorded.
    expect(result.session.actions).toEqual([{ type: "goto", url: "http://x/" }]);
  });
});

describe("drive resilience", () => {
  it("retries a transient model failure once and continues", async () => {
    let calls = 0;
    const flaky: ModelClient = {
      complete: (): Promise<ModelResponse> => {
        calls++;
        if (calls === 1) return Promise.reject(new Error("502 upstream"));
        return Promise.resolve({ toolCalls: [{ name: "finish", arguments: {} }] });
      },
    };
    const result = await new AutonomousDriver(fakePage(), flaky, {
      ...OPTIONS,
      modelRetryBackoffMs: 0,
    }).drive();

    expect(result.finished).toBe(true);
    expect(calls).toBe(2);
  });

  it("fails with both errors when the model call fails twice", async () => {
    const dead: ModelClient = { complete: () => Promise.reject(new Error("502 upstream")) };
    await expect(
      new AutonomousDriver(fakePage(), dead, { ...OPTIONS, modelRetryBackoffMs: 0 }).drive(),
    ).rejects.toThrow(/model call failed twice: 502 upstream; retry: 502 upstream/);
  });

  it("times out a stalled model call instead of hanging the drive", async () => {
    const stalled: ModelClient = { complete: () => new Promise(() => undefined) };
    await expect(
      new AutonomousDriver(fakePage(), stalled, {
        ...OPTIONS,
        modelTimeoutMs: 20,
        modelRetryBackoffMs: 0,
      }).drive(),
    ).rejects.toThrow(/timed out after 20ms/);
  });

  it("accumulates provider-reported token usage across turns", async () => {
    const model = new ScriptedModel([
      {
        toolCalls: [{ name: "navigate", arguments: { url: "http://x/a" } }],
        usage: { inputTokens: 100, outputTokens: 10 },
      },
      { toolCalls: [{ name: "finish", arguments: {} }], usage: { inputTokens: 200, outputTokens: 20 } },
    ]);
    const result = await new AutonomousDriver(fakePage(), model, OPTIONS).drive();

    expect(result.tokens).toEqual({ input: 300, output: 30 });
  });

  it("reports no tokens when the model surfaces no usage", async () => {
    const model = new ScriptedModel([{ toolCalls: [{ name: "finish", arguments: {} }] }]);
    const result = await new AutonomousDriver(fakePage(), model, OPTIONS).drive();
    expect(result.tokens).toBeUndefined();
  });

  it("emits a per-turn audit event through onStep", async () => {
    const events: { step: number; calls: string[]; outcomes: string[] }[] = [];
    const model = new ScriptedModel([
      { toolCalls: [{ name: "navigate", arguments: { url: "https://evil.example.net/" } }] },
      { toolCalls: [{ name: "finish", arguments: {} }] },
    ]);
    await new AutonomousDriver(fakePage(), model, {
      ...OPTIONS,
      onStep: (e) => events.push({ step: e.step, calls: e.calls, outcomes: e.outcomes }),
    }).drive();

    expect(events.map((e) => e.step)).toEqual([1, 2]);
    expect(events[0]?.calls).toEqual(["navigate"]);
    expect(events[0]?.outcomes.join()).toContain("ERROR navigate");
    expect(events[1]?.outcomes).toEqual(["finish"]);
  });
});
