/**
 * The session recorder (Proofkeeper Initiative 2, the moat).
 *
 * Wraps a Playwright {@link Page} and, for each interaction or assertion,
 * performs it against the real page FIRST and records the {@link Action} only
 * if it succeeded. A recorded trace is therefore a sequence that actually held
 * during the drive — the faithful half of "faithful session→test". The
 * deterministic {@link emitSpec} half turns that trace into a committed test.
 *
 * In v0.0.1 the drive is scripted by the caller (or a BYO-model agent calling
 * these methods); the recorder's contract is the same either way.
 */

import { expect, type Page } from "@playwright/test";

import type { Action, Locator, RecordedSession } from "./actions.js";
import { runCommand, evalOutputMatch, type CommandResult, type OutputAssertion } from "./terminal.js";

export interface RecorderOptions {
  title: string;
  startUrl: string;
  capabilityId?: string;
}

export class Recorder {
  private readonly actions: Action[] = [];
  /** The most recently run command's result; terminal assertions target it. */
  private last: CommandResult | undefined;

  constructor(
    private readonly page: Page,
    private readonly options: RecorderOptions,
  ) {}

  private resolve(loc: Locator) {
    switch (loc.kind) {
      case "role":
        return this.page.getByRole(loc.role as Parameters<Page["getByRole"]>[0], { name: loc.name });
      case "testId":
        return this.page.getByTestId(loc.testId);
      case "text":
        return this.page.getByText(loc.text);
      case "label":
        return this.page.getByLabel(loc.label);
      case "css":
        return this.page.locator(loc.selector);
    }
  }

  /** Navigate to the session's start URL (or another url), recording it. */
  async goto(url: string = this.options.startUrl): Promise<void> {
    await this.page.goto(url);
    this.actions.push({ type: "goto", url });
  }

  async click(locator: Locator): Promise<void> {
    await this.resolve(locator).click();
    this.actions.push({ type: "click", locator });
  }

  async fill(locator: Locator, value: string): Promise<void> {
    await this.resolve(locator).fill(value);
    this.actions.push({ type: "fill", locator, value });
  }

  async check(locator: Locator): Promise<void> {
    await this.resolve(locator).check();
    this.actions.push({ type: "check", locator });
  }

  async press(locator: Locator, key: string): Promise<void> {
    await this.resolve(locator).press(key);
    this.actions.push({ type: "press", locator, key });
  }

  /** Assert text, recording the assertion only if it currently holds. */
  async expectText(locator: Locator, text: string): Promise<void> {
    await expect(this.resolve(locator)).toHaveText(text);
    this.actions.push({ type: "expectText", locator, text });
  }

  async expectVisible(locator: Locator): Promise<void> {
    await expect(this.resolve(locator)).toBeVisible();
    this.actions.push({ type: "expectVisible", locator });
  }

  /**
   * Run a shell command, record it, and return its result so the caller can
   * decide what to assert. The result becomes the target for the next
   * {@link expectOutput} / {@link expectExit}.
   */
  async run(command: string, options: { cwd?: string } = {}): Promise<CommandResult> {
    this.last = runCommand(command, options);
    this.actions.push({ type: "run", command, ...(options.cwd !== undefined ? { cwd: options.cwd } : {}) });
    return this.last;
  }

  /** Assert the last command's output, recording the assertion only if it holds. */
  async expectOutput(assertion: OutputAssertion): Promise<void> {
    if (!this.last) throw new Error("expect_output called before any run_command");
    if (!evalOutputMatch(this.last, assertion)) {
      throw new Error(
        `output assertion failed: ${assertion.stream} did not ${assertion.match} ${JSON.stringify(assertion.value)}`,
      );
    }
    this.actions.push({ type: "expectOutput", match: assertion.match, stream: assertion.stream, value: assertion.value });
  }

  /** Assert the last command's exit code, recording the assertion only if it holds. */
  async expectExit(code: number): Promise<void> {
    if (!this.last) throw new Error("expect_exit called before any run_command");
    if (this.last.code !== code) {
      throw new Error(`exit assertion failed: expected ${code}, got ${this.last.code}`);
    }
    this.actions.push({ type: "expectExit", code });
  }

  /** The recorded session so far, ready to hand to the compiler. */
  recording(): RecordedSession {
    return {
      capabilityId: this.options.capabilityId,
      title: this.options.title,
      startUrl: this.options.startUrl,
      actions: [...this.actions],
    };
  }
}
