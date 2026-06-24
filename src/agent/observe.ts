/**
 * Page observation — how the autonomous drive lets the model perceive state.
 *
 * Each turn the driver hands the model a compact snapshot of the live page: its
 * URL and title, the visible text, and Playwright's accessibility (ARIA) tree —
 * the same structure that makes role/name locators resilient. The model decides
 * its next action from this; the driver never decides for it.
 */

import type { Page } from "@playwright/test";

export interface PageObservation {
  url: string;
  title: string;
  /** Body innerText — the visible text content. */
  text: string;
  /** Playwright ARIA snapshot of the body — roles and accessible names. */
  aria: string;
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
  return [
    `URL: ${o.url}`,
    `Title: ${o.title}`,
    `Visible text:\n${o.text}`,
    `Accessibility tree:\n${o.aria}`,
  ].join("\n\n");
}
