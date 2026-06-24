/**
 * The `## Verified By` write-back renderer — Proofkeeper Initiative 5.
 *
 * Proofkeeper proposes verification links by rendering the exact section the
 * engine recognizes (ADR-084): a `## Verified By` heading followed by a list of
 * external test/trace references. The targets are external (ADR-084), so the
 * engine emits them with `resolved: false` — which is expected, not an error.
 *
 * This is PROPOSE-ONLY. The renderer returns Markdown; it never writes into a
 * corpus. Applying it is a human-reviewed pull request (ADR-065) — the trust
 * boundary is the reviewer, never Proofkeeper.
 */

/** A single verifying reference: a committed test and, optionally, its trace. */
export interface VerificationLink {
  /** Path/reference to the committed Playwright test. */
  test: string;
  /** Optional path/reference to the replayable trace artifact. */
  trace?: string;
  /** Optional human label for the link. */
  label?: string;
}

/** The heading the engine recognizes as the verified_by section (ADR-084). */
export const VERIFIED_BY_HEADING = "## Verified By";

/** Render one verification link as a `## Verified By` list item. */
export function renderVerificationLink(link: VerificationLink): string {
  const ref = link.label ? `${link.label} — \`${link.test}\`` : `\`${link.test}\``;
  const trace = link.trace ? ` (trace: \`${link.trace}\`)` : "";
  return `- ${ref}${trace}`;
}

/**
 * Render the `## Verified By` section body Proofkeeper proposes for a
 * capability. Returns the heading plus one list item per link.
 *
 * @throws {Error} when given no links — an empty section is never proposed.
 */
export function renderVerifiedBySection(links: VerificationLink[]): string {
  if (links.length === 0) {
    throw new Error("refusing to render an empty `## Verified By` section");
  }
  return [VERIFIED_BY_HEADING, "", ...links.map(renderVerificationLink), ""].join("\n");
}

/** A proposed write-back: which capability, and the section to add to it. */
export interface VerifiedByProposal {
  capabilityId: string;
  section: string;
  links: VerificationLink[];
}

/**
 * Build a propose-only write-back for a capability. The result is meant to be
 * carried into a human-reviewed pull request against the target's Lore corpus —
 * never written directly.
 */
export function proposeVerifiedBy(
  capabilityId: string,
  links: VerificationLink[],
): VerifiedByProposal {
  return { capabilityId, section: renderVerifiedBySection(links), links };
}
