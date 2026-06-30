---
schema_version: 1
id: PK-KWBPDXFX93TH
type: design
---
# Browser-Extension Verification

## Context

Proofkeeper's drive builds the browser in one seam (`browserDrive` in the CLI) with `chromium.launch()` + a page, and the emitter always produces a `test({ page })` spec on the default fixture. Neither loads an extension. This design adds extension verification by changing only the launch seam and adding an emitter mode, leaving the model-driven loop untouched.

## User Need

A developer shipping a browser extension wants Proofkeeper to drive the extension — its popup/options pages and its effect on web pages — and leave a durable, re-runnable test, using their own model, the same drive→compile→fidelity→run→write-back loop.

## Design

- **Config**: `EnvironmentConfig.extensionPath` (and a `--extension <dir>` flag on `qa`), surfaced through `ResolvedTarget.extensionPath` and threaded into `DriveOptions.extensionPath`.
- **Launch**: when an extension is set, `browserDrive` uses `chromium.launchPersistentContext("", { channel: "chromium", args: ["--disable-extensions-except=<dir>", "--load-extension=<dir>"] })`. `channel: "chromium"` selects the new headless mode — the only headless that loads extensions. A shared helper (`loadExtension`) discovers the runtime ID from the MV3 service worker (MV2 fallback: a background page; then wait for the worker), and the ID + `chrome-extension://<id>/` base are passed to the driver, which tells the model where the extension's pages live.
- **Recording**: `RecordedSession.extensionPath` carries the unpacked dir (set by the Recorder).
- **Emitter (the moat)**: when `extensionPath` is set, emit a persistent-context spec — launch with the extension, rediscover the ID from the service worker, open a page — and rewrite any `chrome-extension://<recorded-id>/…` goto to `chrome-extension://${extId}/…` using the runtime ID. Normal URLs still map to `BASE`. Determinism preserved; non-extension specs are byte-identical to before.

## Constraints

- Extensions need a persistent context and new headless; a plain `launch()` or old headless never loads them. Pure headed needs a display, so CI uses `channel: "chromium"`.
- The extension ID is non-deterministic per load, so it is never recorded into the committed spec — always rediscovered at run time.
- MV3 first; packed `.crx`, the Chrome Web Store, and non-Chromium browsers are out of scope.

## Rationale

Centralising on the one launch seam plus an emitter mode keeps the change small and the driver/model loop unchanged. Rediscovering the ID at run time is what makes the compiled test portable — the moat (a faithful, re-runnable test) holds for extensions exactly as for pages.

## Alternatives

- **Pin a stable extension ID via a manifest `key`.** Rejected as the default: it requires editing the extension under test; runtime discovery works for any unpacked extension. (Noted as an option for teams that already pin a key.)
- **A dedicated `open_extension_popup` drive tool.** Deferred: `navigate` to the surfaced `chrome-extension://<id>/…` URL suffices for the MVP.
- **Headed Chromium under xvfb in CI.** Rejected: `channel: "chromium"` new headless is simpler and needs no virtual display.

## Accessibility

Not applicable — a drive/launch and code emitter; output is a CLI run and generated test source.

## Style Guidance

Mirror the existing seams: the persistent-context launch lives beside the plain launch in `browserDrive`; the emitter branches at the top of `emitSpec` and reuses the existing action emitters.

## Open Questions

- Whether to support packed `.crx` install and a manifest-`key` stable-ID mode once there is demand. Deferred.

## Related Requirements

- req-extension-verification

## Related Roadmaps

- autonomous-qa-enhancements

## Status

Accepted
