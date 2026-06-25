/**
 * Pull-request comment renderers — Proofkeeper Initiative 5.
 *
 * Two informational comments, both behind the human-review boundary (ADR-065):
 * Proofkeeper never merges or approves; it only reports.
 *
 *  - {@link renderWriteBackComment}: a confirmation on the write-back PR it
 *    raises — the linked evidence plus the fidelity result.
 *  - {@link renderCoverageComment}: a verification-coverage status for a
 *    developer's feature PR, driven by the coverage read-model.
 *
 * Pure string builders (no I/O) so they are unit-testable; the gateway posts.
 */

import type { CoverageReport } from "../coverage/model.js";
import type { RepoGateway } from "./proposer.js";
import type { VerificationLink } from "./verified-by.js";

const REVIEW_NOTE =
  "_Informational — a human reviewer accepts the link (ADR-065). Proofkeeper produces and runs the evidence; it does not merge or approve._";

/** Outcome of the fidelity gate, as summarized in a comment. */
export interface FidelitySummary {
  attempts: number;
  passed: number;
  stable: boolean;
}

function linkLine(link: VerificationLink): string {
  return `- \`${link.test}\`${link.trace ? ` (trace: \`${link.trace}\`)` : ""}`;
}

/** Confirmation comment for the write-back PR Proofkeeper raises. */
export function renderWriteBackComment(input: {
  capabilityId: string;
  links: VerificationLink[];
  fidelity?: FidelitySummary;
  /** Readable step summary of the driven flow. */
  steps?: string[];
}): string {
  const lines = [
    `Proofkeeper recorded verification for **${input.capabilityId}**.`,
    "",
    "Linked evidence:",
    ...input.links.map(linkLine),
  ];
  if (input.steps && input.steps.length > 0) {
    lines.push("", "Steps exercised:");
    input.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  const trace = input.links.find((l) => l.trace)?.trace;
  if (trace) {
    lines.push("", `Replay the trace locally: \`npx playwright show-trace ${trace}\``);
  }
  if (input.fidelity) {
    const f = input.fidelity;
    lines.push(
      "",
      `Fidelity gate: ${f.passed}/${f.attempts} re-runs green — ${f.stable ? "stable, safe to commit" : "unstable, quarantined"}.`,
    );
  }
  lines.push("", REVIEW_NOTE);
  return lines.join("\n");
}

export interface CoverageCommentOptions {
  /** Optional heading override. */
  title?: string;
}

/** Verification-coverage status comment for a developer's feature PR. */
export function renderCoverageComment(report: CoverageReport, options: CoverageCommentOptions = {}): string {
  const heading = options.title ?? "Proofkeeper verification coverage";
  const src = report.source ? ` for \`${report.source}\`` : "";
  const lines = [
    `## ${heading}${src}`,
    "",
    `${report.verified.length}/${report.total} capabilities have a verifying test; ${report.unverified.length} unverified.`,
  ];

  if (report.verified.length > 0) {
    lines.push("", "Verified by committed tests:");
    for (const c of report.verified) {
      // Bare paths backtick cleanly; only wrap a target that has no backtick of
      // its own, so a legacy verbose target is shown verbatim rather than nested.
      const targets = c.verifiedBy.map((t) => (t.includes("`") ? t : `\`${t}\``)).join(", ");
      lines.push(`- **${c.id}** — ${c.title}: ${targets}`);
    }
  }
  if (report.unverified.length > 0) {
    lines.push("", "Still unverified:");
    for (const c of report.unverified) {
      lines.push(`- ${c.id} — ${c.title}`);
    }
  }

  lines.push("", REVIEW_NOTE);
  return lines.join("\n");
}

/** One driven capability's outcome, as summarized in the scoped-QA comment. */
export interface ScopedQaCommentRow {
  id: string;
  title: string;
  stable?: boolean;
  writeBackUrl?: string;
  /** Set when the capability could not be driven. */
  error?: string;
}

export interface ScopedQaCommentInput {
  changedCount: number;
  driven: ScopedQaCommentRow[];
  /** Scoped capabilities already verified — not re-driven. */
  alreadyVerified: { id: string; title: string }[];
  /** Config ids that matched the diff but are not capability nodes. */
  unknown: string[];
}

/** Scoped-QA evidence comment for the feature PR that triggered the run. */
export function renderScopedQaComment(input: ScopedQaCommentInput): string {
  const lines = [
    `## Proofkeeper QA — ${input.changedCount} changed file(s)`,
    "",
    input.driven.length > 0
      ? `Drove ${input.driven.length} capability(ies) this change touched:`
      : "No unverified capabilities were touched by this change.",
  ];
  for (const r of input.driven) {
    if (r.error) {
      lines.push(`- ⚠️ **${r.id}** — ${r.title}: ${r.error}`);
    } else if (r.stable) {
      lines.push(`- ✅ **${r.id}** — ${r.title}: stable${r.writeBackUrl ? ` — proposed ${r.writeBackUrl}` : ""}`);
    } else {
      lines.push(`- ❌ **${r.id}** — ${r.title}: unstable (quarantined)`);
    }
  }
  if (input.alreadyVerified.length > 0) {
    lines.push("", "Already verified, not re-driven:");
    for (const c of input.alreadyVerified) lines.push(`- ${c.id} — ${c.title}`);
  }
  if (input.unknown.length > 0) {
    lines.push("", `Config ids not found as capabilities in the graph: ${input.unknown.join(", ")}`);
  }
  lines.push("", REVIEW_NOTE);
  return lines.join("\n");
}

/**
 * Post a verification-coverage status comment on a feature pull request. The
 * report comes from the coverage read-model (`computeCoverage`). Informational
 * only — it never approves or merges.
 */
export function commentCoverageStatus(
  gateway: RepoGateway,
  input: { prNumber: number; report: CoverageReport; options?: CoverageCommentOptions },
): Promise<{ url: string }> {
  return gateway.commentOnPullRequest({
    number: input.prNumber,
    body: renderCoverageComment(input.report, input.options ?? {}),
  });
}
