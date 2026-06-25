/**
 * Merge a `## Verified By` section into a requirement artifact's Markdown —
 * Proofkeeper Initiative 5 (the write-back transform).
 *
 * Pure and idempotent: given the artifact's current content and a set of
 * {@link VerificationLink}s, return the updated content with the links recorded
 * under `## Verified By`. Re-running with the same links is a no-op (the diff is
 * empty), which is what lets the proposer skip opening an empty pull request.
 *
 * Placement follows the engine's relationship-section ordering (ADR-084):
 * `## Verified By` is the last relationship section, so it is inserted directly
 * after the trailing `## Related *` block (or `## Supersedes`), and otherwise
 * appended. An existing section is merged in place, preserving its lines.
 *
 * This is a pure transform. It never writes a file or touches a corpus — the
 * proposer carries the result into a human-reviewed pull request (ADR-065).
 */

import {
  renderVerifiedByItem,
  verificationRefs,
  VERIFIED_BY_HEADING,
  type VerificationLink,
} from "./verified-by.js";

const SECTION_TITLE = "verified by";

interface Heading {
  /** Line index of the `## ` heading. */
  line: number;
  /** Lowercased heading title (e.g. "related decisions"). */
  title: string;
}

/** Level-2 (`## `) headings only — `### ` subsections belong to their parent. */
function level2Headings(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  lines.forEach((line, index) => {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match && !line.startsWith("###")) {
      headings.push({ line: index, title: match[1]!.toLowerCase() });
    }
  });
  return headings;
}

/** The first backtick-quoted token on a list item — its reference path. */
function itemRef(item: string): string | undefined {
  return /`([^`]+)`/.exec(item)?.[1];
}

/**
 * Merge `links` into the `## Verified By` section of `content`. Each link
 * contributes its bare test reference and, when present, its bare trace
 * reference (both are external-target references, ADR-084).
 *
 * @throws {Error} when `links` is empty — an empty section is never written.
 */
export function mergeVerifiedBy(content: string, links: VerificationLink[]): string {
  if (links.length === 0) {
    throw new Error("refusing to merge an empty `## Verified By` section");
  }
  const wanted = verificationRefs(links);
  const lines = content.split("\n");
  const headings = level2Headings(lines);
  const existing = headings.find((h) => h.title === SECTION_TITLE);

  if (existing) {
    // Merge into the existing section: keep its lines, append only new refs.
    const next = headings.find((h) => h.line > existing.line);
    const end = next ? next.line : lines.length;
    const sectionLines = lines.slice(existing.line, end);
    const presentRefs = new Set(
      sectionLines.filter((l) => l.startsWith("- ")).map(itemRef).filter(Boolean) as string[],
    );
    const additions = wanted.filter((ref) => !presentRefs.has(ref)).map(renderVerifiedByItem);
    if (additions.length === 0) return content; // idempotent: nothing new

    // Insert new items after the last existing list item (or after the heading).
    let lastItem = existing.line;
    for (let i = existing.line; i < end; i++) {
      if (lines[i]!.startsWith("- ")) lastItem = i;
    }
    const merged = [...lines.slice(0, lastItem + 1), ...additions, ...lines.slice(lastItem + 1)];
    return merged.join("\n");
  }

  // No existing section — build one and place it after the relationship block.
  const section = [VERIFIED_BY_HEADING, "", ...wanted.map(renderVerifiedByItem)];
  const anchor =
    [...headings].reverse().find((h) => h.title.startsWith("related ")) ??
    headings.find((h) => h.title === "supersedes");

  if (anchor) {
    const next = headings.find((h) => h.line > anchor.line);
    const insertAt = next ? next.line : lines.length;
    const before = lines.slice(0, insertAt);
    const after = lines.slice(insertAt);
    // Ensure a blank line separates the new section from its neighbours.
    while (before.length > 0 && before[before.length - 1] === "") before.pop();
    const block = ["", ...section, ...(after.length > 0 ? [""] : [])];
    return [...before, ...block, ...after].join("\n");
  }

  // Append at end of document.
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") trimmed.pop();
  return [...trimmed, "", ...section, ""].join("\n");
}
