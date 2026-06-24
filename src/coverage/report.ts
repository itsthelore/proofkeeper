/**
 * Rendering for the coverage read-model: a human table and a stable JSON
 * contract. Both are pure — given a {@link CoverageReport} they return a
 * string; the CLI owns writing it out.
 */

import type { CoverageReport } from "./model.js";

/** Stable machine contract for `proofkeeper coverage --json`. */
export interface CoverageJson {
  schema_version: "1";
  source: string;
  total: number;
  verified: number;
  unverified: { id: string; title: string; status: string }[];
  verifiedDetail: { id: string; targets: string[] }[];
}

export function toJson(report: CoverageReport): CoverageJson {
  return {
    schema_version: "1",
    source: report.source,
    total: report.total,
    verified: report.verified.length,
    unverified: report.unverified.map(({ id, title, status }) => ({ id, title, status })),
    verifiedDetail: report.verified.map((c) => ({ id: c.id, targets: c.verifiedBy })),
  };
}

export function renderJson(report: CoverageReport): string {
  return JSON.stringify(toJson(report), null, 2);
}

/** A compact, human-readable coverage summary with a table of gaps. */
export function renderHuman(report: CoverageReport): string {
  const lines: string[] = [];
  const src = report.source ? ` (${report.source})` : "";
  const verified = report.verified.length;
  const unverified = report.unverified.length;

  lines.push(`Proofkeeper coverage${src}`);

  if (report.total === 0) {
    lines.push("No capabilities (requirement artifacts) found in the graph.");
    return lines.join("\n");
  }

  lines.push(`${verified}/${report.total} capabilities verified, ${unverified} unverified.`);

  if (unverified > 0) {
    lines.push("");
    lines.push("Unverified capabilities:");
    const idWidth = Math.max(2, ...report.unverified.map((c) => c.id.length));
    const statusWidth = Math.max(6, ...report.unverified.map((c) => c.status.length));
    for (const c of report.unverified) {
      lines.push(`  ${c.id.padEnd(idWidth)}  ${c.status.padEnd(statusWidth)}  ${c.title}`);
    }
  } else {
    lines.push("All capabilities have at least one verifying test.");
  }

  return lines.join("\n");
}
