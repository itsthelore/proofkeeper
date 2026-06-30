// Minimal MV3 background service worker. Its mere registration gives the
// extension a stable runtime presence whose URL carries the generated id, which
// Proofkeeper reads to address the extension's pages.
self.addEventListener("install", () => {});
