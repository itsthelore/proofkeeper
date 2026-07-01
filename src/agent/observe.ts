/**
 * Page observation — how the autonomous drive lets the model perceive state.
 *
 * Each turn the driver hands the model a compact snapshot of the live page: its
 * URL and title, the visible text, and Playwright's accessibility (ARIA) tree —
 * the same structure that makes role/name locators resilient. The model decides
 * its next action from this; the driver never decides for it.
 *
 * Console messages and network responses are *events*, not snapshot state, so a
 * {@link PageMonitor} subscribes to them during the drive and the driver merges
 * the most recent of each into the observation (the Playwright-MCP execution-
 * feedback context). This feedback is observation only — it is never recorded as
 * a test action.
 */

import type { ConsoleMessage, Page, Response } from "@playwright/test";

import { redactText, redactUrl } from "./redact.js";

export interface PageObservation {
  url: string;
  title: string;
  /** Body innerText — the visible text content. */
  text: string;
  /** Playwright ARIA snapshot of the body — roles and accessible names. */
  aria: string;
  /** Recent console messages (`[type] text`), most recent last. */
  console?: string[];
  /** Recent network responses (`status method url`), most recent last. */
  network?: string[];
}

export async function observePage(page: Page): Promise<PageObservation> {
  const body = page.locator("body");
  const [title, text, aria] = await Promise.all([
    page.title().catch(() => ""),
    body.innerText().catch(() => ""),
    body.ariaSnapshot().catch(() => ""),
  ]);
  return { url: page.url(), title, text: text.trim(), aria: aria.trim() };
}

/** Render an observation as the text block fed to the model. */
export function renderObservation(o: PageObservation): string {
  const blocks = [
    `URL: ${o.url}`,
    `Title: ${o.title}`,
    `Visible text:\n${o.text}`,
    `Accessibility tree:\n${o.aria}`,
  ];
  if (o.console && o.console.length > 0) blocks.push(`Console:\n${o.console.join("\n")}`);
  if (o.network && o.network.length > 0) blocks.push(`Network:\n${o.network.join("\n")}`);
  return blocks.join("\n\n");
}

/** A live subscription to a page's console and network events, bounded to a recent window. */
export interface PageMonitor {
  /** Recent console messages (`[type] text`), most recent last. */
  readonly console: string[];
  /** Recent network responses (`status method url`), most recent last. */
  readonly network: string[];
  /** Remove the event listeners. */
  dispose(): void;
}

/**
 * Subscribe to a page's console and network events, keeping the most recent
 * `limit` (default 20) of each. The driver creates one after navigating and
 * disposes it when the drive ends.
 */
export function createPageMonitor(page: Page, options: { limit?: number } = {}): PageMonitor {
  const limit = options.limit ?? 20;
  const consoleBuf: string[] = [];
  const networkBuf: string[] = [];
  const push = (buf: string[], line: string): void => {
    buf.push(line);
    if (buf.length > limit) buf.shift();
  };
  // Console and network lines are side channels shipped to the model provider;
  // scrub token-shaped values and query strings before they enter the window.
  const onConsole = (msg: ConsoleMessage): void => push(consoleBuf, redactText(`[${msg.type()}] ${msg.text()}`));
  const onResponse = (res: Response): void =>
    push(networkBuf, `${res.status()} ${res.request().method()} ${redactUrl(res.url())}`);
  page.on("console", onConsole);
  page.on("response", onResponse);
  return {
    console: consoleBuf,
    network: networkBuf,
    dispose(): void {
      page.off("console", onConsole);
      page.off("response", onResponse);
    },
  };
}
