---
schema_version: 1
id: PK-KWBPDWRYN20M
type: requirement
---
# Browser-Extension Verification

## Problem

Proofkeeper drives a vanilla, non-persistent Chromium page, so it cannot verify a browser extension: an unpacked extension loads only in a persistent context launched with `--load-extension`, and an MV3 extension's ID is regenerated on every load. Teams shipping extensions had no way to let Proofkeeper exercise the extension's own UI or its effect on pages, and no durable test for it.

## Requirements

- [REQ-001] Proofkeeper can load an unpacked browser extension for a drive, configured by a CLI flag (`--extension`) and a per-environment `extensionPath`.
- [REQ-002] The drive runs in a persistent context with the extension loaded, discovers the extension's runtime ID, and tells the model where the extension's pages live so it can drive them.
- [REQ-003] The compiled test re-loads the extension and re-discovers the ID at run time; a recorded `chrome-extension://<id>/…` target is rewritten to the runtime ID, never a stale recorded one.
- [REQ-004] Loading uses Chromium's new headless (the only headless mode that loads extensions), so the drive and the compiled test run headless in CI.
- [REQ-005] With no extension configured, the drive and the emitted test are unchanged (backward compatible).

## Success Metrics

- A capability whose behaviour is an extension popup/options interaction is driven, compiled, and re-run green through the fidelity gate, with the extension actually loaded.
- A compiled extension spec passes on a fresh machine despite the extension ID differing from the recorded run.
- Non-extension sessions emit byte-identical specs to before.

## Risks

- Headless extension support is Chromium-version sensitive. Mitigation: use the documented `channel: "chromium"` new-headless recipe and a browser-gated integration test that loads a real fixture extension.
- A lazy MV3 service worker may not be present immediately. Mitigation: check existing workers, fall back to a background page, then wait for the worker event.

## Assumptions

- Targets are MV3 Chromium extensions loaded unpacked; packed `.crx` and other browsers are out of scope.
- The bundled Chromium (`npx playwright install chromium`) provides the new headless mode.

## Related Roadmaps

- autonomous-qa-enhancements

## Verified By

- `tests/extension.test.ts`
- `tests/compiler-emit.test.ts`
- `tests/extension.integration.test.ts`
