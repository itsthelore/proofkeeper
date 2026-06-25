/**
 * Assemble a `## Verified By` write-back proposal — Proofkeeper Initiative 5.
 *
 * Pure and deterministic (no timestamps): given a target artifact's current
 * content and the verification links, produce the updated content plus the
 * branch name, PR title, and PR body for a human-reviewed pull request. The
 * proposal carries `changed: false` when every link is already present, so the
 * proposer can decline to open an empty PR.
 */

import type { CandidateTest } from "../compiler/types.js";
import type { RunResult } from "../runner/types.js";
import { mergeVerifiedBy } from "./merge.js";
import type { VerificationLink } from "./verified-by.js";

const DEFAULT_BASE_BRANCH = "main";
const DEFAULT_BRANCH_PREFIX = "proofkeeper/verified-by";

export interface BuildProposalInput {
  /** The capability (requirement id) being verified. */
  capabilityId: string;
  /** Path to the requirement artifact within the target corpus. */
  targetPath: string;
  /** Current content of the target artifact. */
  originalContent: string;
  /** The verification links to record. */
  links: VerificationLink[];
  /** Base branch the PR targets. Defaults to `main`. */
  baseBranch?: string;
  /** Prefix for the generated head branch. Defaults to `proofkeeper/verified-by`. */
  branchPrefix?: string;
}

export interface WriteBackProposal {
  capabilityId: string;
  targetPath: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
  originalContent: string;
  updatedContent: string;
  links: VerificationLink[];
  /** False when the merge produced no change (all links already present). */
  changed: boolean;
}

/** Deterministic, filesystem/branch-safe slug. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "capability";
}

function proposalBody(input: {
  capabilityId: string;
  targetPath: string;
  links: VerificationLink[];
}): string {
  const items = input.links
    .map((l) => `- \`${l.test}\`${l.trace ? ` (trace: \`${l.trace}\`)` : ""}`)
    .join("\n");
  return [
    `Proofkeeper proposes recording verification for **${input.capabilityId}**.`,
    "",
    `It adds a \`## Verified By\` section to \`${input.targetPath}\` linking the`,
    "committed test(s) and replayable trace(s) that exercise this capability, as",
    "bare reference paths.",
    "",
    "These are external-target links (ADR-084): the engine emits them with",
    "`resolved: false` and the literal reference as target — that is expected, not",
    "an error.",
    "",
    "Proposed links:",
    items,
    "",
    "This is a proposal for human review (ADR-065). Proofkeeper produces and runs",
    "the evidence; a reviewer accepts the link. Merge only after confirming the",
    "referenced test and trace.",
  ].join("\n");
}

/** Build a write-back proposal (does not touch any repo). */
export function buildProposal(input: BuildProposalInput): WriteBackProposal {
  const baseBranch = input.baseBranch ?? DEFAULT_BASE_BRANCH;
  const branchPrefix = input.branchPrefix ?? DEFAULT_BRANCH_PREFIX;
  const updatedContent = mergeVerifiedBy(input.originalContent, input.links);
  return {
    capabilityId: input.capabilityId,
    targetPath: input.targetPath,
    baseBranch,
    headBranch: `${branchPrefix}/${slug(input.capabilityId)}`,
    title: `docs(verify): record Verified By for ${input.capabilityId}`,
    body: proposalBody(input),
    originalContent: input.originalContent,
    updatedContent,
    links: input.links,
    changed: updatedContent !== input.originalContent,
  };
}

/**
 * Derive verification links from a compiled test and its run results: the
 * committed spec (the corpus verifier) plus the first replayable trace produced
 * for it (surfaced in the PR).
 */
export function linksFromResults(candidate: CandidateTest, results: RunResult[]): VerificationLink[] {
  const trace = results.find((r) => r.testId === candidate.id && r.tracePath)?.tracePath;
  const link: VerificationLink = { test: candidate.specPath };
  if (trace) link.trace = trace;
  return [link];
}
