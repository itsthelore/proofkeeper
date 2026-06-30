/**
 * Browser-extension loading for the drive.
 *
 * Chromium loads an unpacked extension only in a *persistent context* launched
 * with `--load-extension` / `--disable-extensions-except`. An MV3 extension then
 * exposes its generated ID through a background **service worker** (MV2: a
 * background page) — the ID is non-deterministic per load, so it must be
 * discovered at runtime, never hard-coded. This module is the single place that
 * derives the extension ID from a live context, shared by the CLI's drive launch
 * and (in spirit) the emitted spec, which rediscovers the ID the same way.
 */

import type { BrowserContext } from "@playwright/test";

/** Parse the extension ID (the host) from a `chrome-extension://<id>/…` URL. */
export function extensionIdFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.protocol !== "chrome-extension:") return undefined;
    return u.host || undefined;
  } catch {
    return undefined;
  }
}

/** A loaded extension: its runtime ID and the base URL its pages live under. */
export interface LoadedExtension {
  id: string;
  /** `chrome-extension://<id>/` — prefix for the popup/options pages. */
  base: string;
}

/** Build {@link LoadedExtension} from a resolved extension ID. */
function loaded(id: string): LoadedExtension {
  return { id, base: `chrome-extension://${id}/` };
}

/**
 * Discover the extension ID from a persistent {@link BrowserContext} that was
 * launched with the extension loaded. Prefers the MV3 service worker, falls back
 * to an MV2 background page, and finally waits for a service worker to register
 * (an MV3 worker can be lazy). Throws if no extension surface appears.
 */
export async function loadExtension(
  context: BrowserContext,
  options: { timeoutMs?: number } = {},
): Promise<LoadedExtension> {
  const fromWorker = context.serviceWorkers()[0]?.url();
  if (fromWorker) {
    const id = extensionIdFromUrl(fromWorker);
    if (id) return loaded(id);
  }

  const fromBackground = context.backgroundPages?.()[0]?.url();
  if (fromBackground) {
    const id = extensionIdFromUrl(fromBackground);
    if (id) return loaded(id);
  }

  const worker = await context.waitForEvent(
    "serviceworker",
    options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {},
  );
  const id = extensionIdFromUrl(worker.url());
  if (!id) {
    throw new Error(`could not determine extension id from service worker url '${worker.url()}'`);
  }
  return loaded(id);
}
