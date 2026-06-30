// Flip the status to "on" when the button is clicked — a tiny observable
// outcome the extension-verification drive/test can assert.
document.getElementById("enable")?.addEventListener("click", () => {
  const status = document.querySelector('[data-testid="status"]');
  if (status) status.textContent = "on";
});
