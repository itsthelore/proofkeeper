/**
 * Redaction of observation side-channels before they reach the model.
 *
 * The transcript a drive builds is shipped to a third-party model provider, so
 * secrets that merely pass through the browser — tokens in query strings,
 * credentials a command prints, API keys in console noise — must not ride
 * along. These helpers scrub the *side channels* (network lines, console lines,
 * command output, response snippets). The page's own visible text and ARIA tree
 * are deliberately NOT redacted: assertions are copied from what the model
 * sees, and masking DOM text would make the recorded expectation diverge from
 * the real page.
 */

/** Sensitive query-parameter names masked by {@link redactText}. */
const SENSITIVE_PARAMS = /([?&](?:token|access_token|refresh_token|id_token|api[_-]?key|apikey|key|secret|password|auth|signature|sig)=)[^&\s"']+/gi;

/** Bearer-style credentials in headers or logged text. */
const BEARER = /\b(bearer\s+)[a-z0-9._~+/=-]{8,}/gi;

/** Common standalone key shapes (OpenAI/Anthropic/GitHub-style prefixes). */
const KEY_SHAPES = /\b(?:sk|pk|rk)-[a-z0-9_-]{8,}\b|\bgh[pousr]_[a-z0-9]{16,}\b|\bxox[baprs]-[a-z0-9-]{10,}\b/gi;

/**
 * Strip a URL's query string and fragment — the parts that routinely carry
 * tokens. Returns the input unchanged when it is not a parseable URL.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hadQuery = parsed.search !== "" || parsed.hash !== "";
    parsed.search = "";
    parsed.hash = "";
    return hadQuery ? `${parsed.toString()}?…` : parsed.toString();
  } catch {
    return url;
  }
}

/** Mask credential-shaped values in free text fed back to the model. */
export function redactText(text: string): string {
  return text
    .replace(SENSITIVE_PARAMS, "$1[redacted]")
    .replace(BEARER, "$1[redacted]")
    .replace(KEY_SHAPES, "[redacted]");
}
