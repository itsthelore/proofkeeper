/**
 * The HTTP/API drive modality — issuing a request and asserting its response,
 * the third of Proofkeeper's tools after the browser and terminal. Gated on the
 * engine decision ADR-085, which records it as an in-scope extension of ADR-083.
 *
 * {@link httpRequest} and {@link jsonPath} are the single source of truth for how
 * a request is issued and how a JSON field is read. The {@link Recorder} uses
 * them while driving, and the emitted spec inlines equivalents — so record and
 * replay agree, which is what lets the fidelity gate mean something for HTTP
 * sessions. No new dependency: global `fetch` (Node ≥ 20).
 */

/** The observable result of one HTTP request. */
export interface HttpResponse {
  status: number;
  body: string;
}

/** A request to issue. */
export interface HttpRequestInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

/** A scalar a JSON assertion compares against. */
export type JsonScalar = string | number | boolean;

/** Issue an HTTP request and capture its status and body text. */
export async function httpRequest(input: HttpRequestInput): Promise<HttpResponse> {
  const res = await fetch(input.url, {
    method: input.method,
    ...(input.headers ? { headers: input.headers } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
  });
  return { status: res.status, body: await res.text() };
}

/** Read a dot-path (e.g. `data.order.id`) out of a parsed JSON value. */
export function jsonPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
