/**
 * The autonomous drive — Proofkeeper Initiative 2's drive phase.
 *
 * A bring-your-own-model agent loop: it navigates to the start URL, observes
 * the live page, asks the {@link ModelClient} what to do next, dispatches the
 * model's tool calls through the {@link Recorder}, observes the result, and
 * repeats until the model finishes (or a step budget is hit). The Recorder
 * records each action only after it succeeds, so the produced
 * {@link RecordedSession} is — by construction — a faithful sequence that held,
 * ready for the deterministic compiler and the fidelity gate.
 *
 * Proofkeeper bundles no model (ADR-035, ADR-002): the caller supplies the
 * ModelClient. This loop is the autonomous runtime; the model is the brain.
 */

import type { Page } from "@playwright/test";

import type { RecordedSession } from "../compiler/actions.js";
import { Recorder } from "../compiler/recorder.js";
import { observePage, renderObservation, createPageMonitor } from "./observe.js";
import type { ModelClient, ModelRequest, ToolCall } from "./model.js";
import {
  DRIVE_TOOLS,
  LOCATOR_GUIDANCE,
  TERMINAL_GUIDANCE,
  HTTP_GUIDANCE,
  parseLocator,
  parseRunCommand,
  parseExpectOutput,
  parseExpectExit,
  parseRequest,
  parseExpectStatus,
  parseExpectJson,
} from "./tools.js";

const DEFAULT_MAX_STEPS = 12;

export interface DriveOptions {
  /** Capability under verification; threads into the recorded session. */
  capabilityId?: string;
  /** Human title for the emitted test. */
  title: string;
  /** Product entry point; the driver navigates here first. */
  startUrl: string;
  /** What the model should accomplish and assert on the product. */
  goal: string;
  /** Maximum model turns before the drive gives up. Defaults to 12. */
  maxSteps?: number;
  /** Reasons earlier attempts at this capability failed, to steer away from them. */
  priorFailures?: string[];
  /** When set, run a planning turn first and record a Markdown test plan. */
  plan?: boolean;
  /**
   * Unpacked extension dir loaded for this drive (browser-extension verification).
   * Threaded into the recorded session so the emitted spec re-loads it.
   */
  extensionPath?: string;
  /**
   * The loaded extension's runtime ID and page base, when an extension is loaded.
   * Surfaced to the model so it can navigate to the extension's pages.
   */
  extension?: { id: string; base: string };
}

export interface DriveResult {
  /** The recorded session, ready to compile. */
  session: RecordedSession;
  /** True if the model signalled completion (vs hitting the step budget). */
  finished: boolean;
  /** Number of model turns taken. */
  steps: number;
  /** The Markdown test plan, when a planning turn ran. */
  plan?: string;
}

/** Instruction for the optional planning turn (a no-tools text response). */
const PLAN_INSTRUCTION =
  "Before acting, write a short Markdown test plan: the steps you will take to verify " +
  "this capability and the observable outcomes you will assert. Respond with the plan only — " +
  "no tool calls.";

/** Outcome of dispatching one tool call against the recorder. */
interface Dispatch {
  ok: boolean;
  error?: string;
  finished?: boolean;
  /** Extra observation to feed back to the model (e.g. a command's output). */
  detail?: string;
}

function systemPrompt(
  goal: string,
  priorFailures: string[] = [],
  extension?: { id: string; base: string },
): string {
  const lines = [
    "You are Proofkeeper's autonomous QA agent. You drive a product like a",
    "developer to verify a capability, using only the provided tools — a browser",
    "and a terminal. Work in small steps: observe, take an action, observe again.",
    "Assert every observable outcome (expect_text / expect_visible for the page,",
    "expect_output / expect_exit for the terminal) — those become the committed",
    "test. When the capability is driven and asserted, call finish.",
    "",
    `Goal: ${goal}`,
  ];
  if (extension) {
    lines.push(
      "",
      `A browser extension is loaded (id ${extension.id}). Its pages live under`,
      `${extension.base} — e.g. navigate to ${extension.base}popup.html or`,
      `${extension.base}options.html to drive the extension's own UI, and visit`,
      "ordinary web pages to verify its effect on them (content scripts).",
    );
  }
  if (priorFailures.length > 0) {
    lines.push(
      "",
      "Earlier attempts at this capability failed for these reasons — do not",
      "repeat them; choose a more robust path or more stable assertions:",
      ...priorFailures.map((r) => `- ${r}`),
    );
  }
  lines.push("", LOCATOR_GUIDANCE, "", TERMINAL_GUIDANCE, "", HTTP_GUIDANCE);
  return lines.join("\n");
}

/** Dispatch one tool call to the recorder. Records only on success. */
async function dispatch(recorder: Recorder, call: ToolCall): Promise<Dispatch> {
  try {
    switch (call.name) {
      case "navigate":
        await recorder.goto(String(call.arguments["url"]));
        return { ok: true };
      case "click":
        await recorder.click(parseLocator(call.arguments));
        return { ok: true };
      case "fill":
        await recorder.fill(parseLocator(call.arguments), String(call.arguments["value"]));
        return { ok: true };
      case "check":
        await recorder.check(parseLocator(call.arguments));
        return { ok: true };
      case "press":
        await recorder.press(parseLocator(call.arguments), String(call.arguments["key"]));
        return { ok: true };
      case "expect_text":
        await recorder.expectText(parseLocator(call.arguments), String(call.arguments["text"]));
        return { ok: true };
      case "expect_visible":
        await recorder.expectVisible(parseLocator(call.arguments));
        return { ok: true };
      case "run_command": {
        const { command, cwd } = parseRunCommand(call.arguments);
        const r = await recorder.run(command, cwd !== undefined ? { cwd } : {});
        const parts = [
          r.stdout.trim() && `stdout: ${r.stdout.trim()}`,
          r.stderr.trim() && `stderr: ${r.stderr.trim()}`,
          `exit: ${r.code}`,
        ].filter(Boolean);
        return { ok: true, detail: `$ ${command}\n${parts.join("\n")}` };
      }
      case "expect_output":
        await recorder.expectOutput(parseExpectOutput(call.arguments));
        return { ok: true };
      case "expect_exit":
        await recorder.expectExit(parseExpectExit(call.arguments));
        return { ok: true };
      case "request": {
        const input = parseRequest(call.arguments);
        const res = await recorder.request(input);
        const snippet = res.body.length > 500 ? `${res.body.slice(0, 500)}…` : res.body;
        return { ok: true, detail: `${input.method} ${input.url}\nstatus: ${res.status}\nbody: ${snippet}` };
      }
      case "expect_status":
        await recorder.expectStatus(parseExpectStatus(call.arguments));
        return { ok: true };
      case "expect_json": {
        const { path, equals } = parseExpectJson(call.arguments);
        await recorder.expectJson(path, equals);
        return { ok: true };
      }
      case "finish":
        return { ok: true, finished: true };
      default:
        return { ok: false, error: `unknown tool '${call.name}'` };
    }
  } catch (err) {
    // The action failed against the real page, so the recorder did NOT record
    // it. Report the failure back to the model so it can adapt.
    return { ok: false, error: (err as Error).message };
  }
}

export class AutonomousDriver {
  constructor(
    private readonly page: Page,
    private readonly model: ModelClient,
    private readonly options: DriveOptions,
  ) {}

  async drive(): Promise<DriveResult> {
    const recorder = new Recorder(this.page, {
      capabilityId: this.options.capabilityId,
      title: this.options.title,
      startUrl: this.options.startUrl,
      ...(this.options.extensionPath !== undefined ? { extensionPath: this.options.extensionPath } : {}),
    });

    // Seed the session at the known entry point, then let the model take over.
    await recorder.goto(this.options.startUrl);

    // Subscribe to console and network events; merge the recent window into each
    // observation so the model sees execution feedback, not just the DOM.
    const monitor = createPageMonitor(this.page);
    const observe = async (): Promise<string> =>
      renderObservation({
        ...(await observePage(this.page)),
        console: [...monitor.console],
        network: [...monitor.network],
      });

    const transcript: ModelRequest["transcript"] = [
      { role: "system", content: systemPrompt(this.options.goal, this.options.priorFailures, this.options.extension) },
      {
        role: "user",
        content: `You are on the start page.\n\n${await observe()}`,
      },
    ];

    // Optional planning turn: ask for a Markdown test plan (no tools → text),
    // record it, and feed it back as context so the drive follows its own plan.
    let plan: string | undefined;
    if (this.options.plan) {
      const response = await this.model.complete({
        transcript: [...transcript, { role: "user", content: PLAN_INSTRUCTION }],
        tools: [],
      });
      const text = response.done?.trim();
      if (text) {
        plan = text;
        transcript.push({ role: "assistant", content: `Test plan:\n${text}` });
      }
    }

    const maxSteps = this.options.maxSteps ?? DEFAULT_MAX_STEPS;
    let finished = false;
    let steps = 0;

    while (steps < maxSteps) {
      steps++;
      const response = await this.model.complete({ transcript, tools: [...DRIVE_TOOLS] });
      const calls = response.toolCalls ?? [];

      if (calls.length === 0) {
        // The model stopped acting; treat a `done` message as completion.
        finished = response.done !== undefined;
        break;
      }

      transcript.push({ role: "assistant", content: JSON.stringify(calls) });

      const outcomes: string[] = [];
      let stop = false;
      for (const call of calls) {
        const result = await dispatch(recorder, call);
        if (result.finished) {
          finished = true;
          stop = true;
          break;
        }
        outcomes.push(
          result.ok
            ? `ok: ${call.name}${result.detail ? `\n${result.detail}` : ""}`
            : `ERROR ${call.name}: ${result.error}`,
        );
      }
      if (stop) break;

      transcript.push({ role: "user", content: `Results:\n${outcomes.join("\n")}\n\n${await observe()}` });
    }

    monitor.dispose();
    const session = recorder.recording();
    if (plan !== undefined) session.plan = plan;
    return { session, finished, steps, ...(plan !== undefined ? { plan } : {}) };
  }
}

/** Convenience wrapper: construct a driver and run it. */
export function runDrive(
  page: Page,
  model: ModelClient,
  options: DriveOptions,
): Promise<DriveResult> {
  return new AutonomousDriver(page, model, options).drive();
}
