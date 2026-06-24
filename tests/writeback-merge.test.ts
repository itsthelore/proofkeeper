import { describe, expect, it } from "vitest";

import { mergeVerifiedBy } from "../src/writeback/merge.js";

const ARTIFACT = `---
schema_version: 1
id: REQ-LOGIN
type: requirement
---
# Requirement: Login

## Status

Accepted

## Requirements

Users can log in.

## Related Decisions

- adr-001

## Related Requirements

- REQ-SESSION

## Future Considerations

Maybe SSO.
`;

/** Level-2 headings in document order. */
function headings(content: string): string[] {
  return content
    .split("\n")
    .filter((l) => /^##\s/.test(l) && !l.startsWith("###"))
    .map((l) => l.replace(/^##\s+/, "").trim());
}

describe("mergeVerifiedBy", () => {
  it("inserts the section after the trailing Related block, before later sections", () => {
    const out = mergeVerifiedBy(ARTIFACT, [{ test: "tests/e2e/login.spec.ts" }]);
    expect(headings(out)).toEqual([
      "Status",
      "Requirements",
      "Related Decisions",
      "Related Requirements",
      "Verified By",
      "Future Considerations",
    ]);
    expect(out).toContain("## Verified By\n\n- `tests/e2e/login.spec.ts`");
  });

  it("preserves frontmatter, title, and unrelated content", () => {
    const out = mergeVerifiedBy(ARTIFACT, [{ test: "t.spec.ts" }]);
    expect(out).toContain("id: REQ-LOGIN");
    expect(out).toContain("# Requirement: Login");
    expect(out).toContain("Maybe SSO.");
  });

  it("is idempotent — re-merging the same link changes nothing", () => {
    const once = mergeVerifiedBy(ARTIFACT, [{ test: "t.spec.ts", trace: "tr.zip" }]);
    const twice = mergeVerifiedBy(once, [{ test: "t.spec.ts", trace: "tr.zip" }]);
    expect(twice).toBe(once);
  });

  it("merges new links into an existing section, preserving existing items", () => {
    const first = mergeVerifiedBy(ARTIFACT, [{ test: "a.spec.ts" }]);
    const second = mergeVerifiedBy(first, [{ test: "a.spec.ts" }, { test: "b.spec.ts" }]);
    expect(second).toContain("- `a.spec.ts`");
    expect(second).toContain("- `b.spec.ts`");
    expect(headings(second).filter((h) => h === "Verified By")).toHaveLength(1);
  });

  it("dedupes links by test reference within one merge", () => {
    const out = mergeVerifiedBy(ARTIFACT, [{ test: "x.spec.ts" }, { test: "x.spec.ts" }]);
    expect(out.match(/- `x\.spec\.ts`/g)).toHaveLength(1);
  });

  it("appends at the end when there are no relationship sections", () => {
    const minimal = `# Requirement: X\n\n## Requirements\n\nDo a thing.\n`;
    const out = mergeVerifiedBy(minimal, [{ test: "x.spec.ts" }]);
    expect(headings(out)).toEqual(["Requirements", "Verified By"]);
  });

  it("does not treat a ### subsection as the Verified By section", () => {
    const withSub = `# R\n\n## Interface\n\n### Verified By helper\n\nnot a section\n`;
    const out = mergeVerifiedBy(withSub, [{ test: "x.spec.ts" }]);
    // The ### line is untouched; a real ## Verified By section is appended.
    expect(out).toContain("### Verified By helper");
    expect(headings(out)).toContain("Verified By");
  });

  it("refuses to merge an empty link list", () => {
    expect(() => mergeVerifiedBy(ARTIFACT, [])).toThrow(/empty/);
  });
});
