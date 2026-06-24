import { describe, expect, it } from "vitest";

import {
  proposeVerifiedBy,
  renderVerifiedBySection,
  VERIFIED_BY_HEADING,
} from "../src/writeback/verified-by.js";

describe("renderVerifiedBySection", () => {
  it("renders the heading the engine recognizes (ADR-084)", () => {
    const md = renderVerifiedBySection([{ test: "tests/e2e/login.spec.ts" }]);
    expect(md.startsWith(VERIFIED_BY_HEADING)).toBe(true);
    expect(md).toContain("- `tests/e2e/login.spec.ts`");
  });

  it("includes a trace reference when present", () => {
    const md = renderVerifiedBySection([{ test: "tests/e2e/login.spec.ts", trace: "traces/login.zip" }]);
    expect(md).toContain("(trace: `traces/login.zip`)");
  });

  it("uses a label when given", () => {
    const md = renderVerifiedBySection([{ test: "t.spec.ts", label: "Login flow" }]);
    expect(md).toContain("Login flow — `t.spec.ts`");
  });

  it("renders one item per link", () => {
    const md = renderVerifiedBySection([{ test: "a.spec.ts" }, { test: "b.spec.ts" }]);
    const items = md.split("\n").filter((l) => l.startsWith("- "));
    expect(items).toHaveLength(2);
  });

  it("refuses to render an empty section", () => {
    expect(() => renderVerifiedBySection([])).toThrow(/empty/);
  });
});

describe("proposeVerifiedBy", () => {
  it("carries the capability id and the rendered section (propose-only)", () => {
    const proposal = proposeVerifiedBy("REQ-LOGIN", [{ test: "tests/e2e/login.spec.ts" }]);
    expect(proposal.capabilityId).toBe("REQ-LOGIN");
    expect(proposal.section).toContain(VERIFIED_BY_HEADING);
    expect(proposal.links).toHaveLength(1);
  });
});
