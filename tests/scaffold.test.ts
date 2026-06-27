import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseGraph } from "../src/coverage/graph.js";
import { scaffoldConfig, renderScaffoldedConfig } from "../src/scaffold/scaffold.js";
import { parseConfig } from "../src/scope/config.js";
import { main } from "../src/cli.js";

function graphOf(): ReturnType<typeof parseGraph> {
  // REQ-CART is verified; REQ-SEARCH and REQ-LOGIN are not.
  return parseGraph(
    JSON.stringify({
      schema_version: "1",
      source: "test",
      nodes: [
        { id: "REQ-CART", type: "requirement", status: "Accepted", title: "Cart" },
        { id: "REQ-SEARCH", type: "requirement", status: "Accepted", title: "Search" },
        { id: "REQ-LOGIN", type: "requirement", status: "Accepted", title: "Login" },
        { id: "ADR-1", type: "decision", status: "Accepted", title: "not a capability" },
      ],
      edges: [
        { source: "REQ-CART", target: "tests/cart.spec.ts", type: "verified_by", directed: true, resolved: false },
      ],
    }),
  );
}

describe("scaffoldConfig", () => {
  it("emits one capability per requirement node, unverified first", () => {
    const config = scaffoldConfig(graphOf());
    expect(config.capabilities.map((c) => c.id)).toEqual(["REQ-LOGIN", "REQ-SEARCH", "REQ-CART"]);
    // Decision nodes are not capabilities.
    expect(config.capabilities.some((c) => c.id === "ADR-1")).toBe(false);
  });

  it("seeds a starter environment, default target, and failure-learning strategy", () => {
    const config = scaffoldConfig(graphOf(), { url: "http://localhost:4000" });
    expect(config.environments?.development?.url).toBe("http://localhost:4000");
    expect(config.defaultTarget).toBe("development");
    expect(config.failureLearning).toBe("suggest_in_report");
    expect(config.capabilities[0]?.paths).toEqual(["src/**"]);
    expect(config.capabilities[0]?.environment).toBe("development");
  });

  it("defaults the development URL when none is given", () => {
    const config = scaffoldConfig(graphOf());
    expect(config.environments?.development?.url).toBe("http://localhost:3000");
  });

  it("produces output the config parser accepts", () => {
    const json = renderScaffoldedConfig(scaffoldConfig(graphOf()));
    expect(() => parseConfig(json)).not.toThrow();
    expect(json.endsWith("\n")).toBe(true);
  });
});

describe("proofkeeper init (CLI)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pk-init-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes a scaffolded config whose ids match the graph", async () => {
    const graphFile = join(dir, "graph.json");
    const out = join(dir, "proofkeeper.config.json");
    await writeFile(graphFile, JSON.stringify(graphOf()), "utf8");

    const code = await main(["init", "--graph-file", graphFile, "--out", out]);
    expect(code).toBe(0);

    const config = parseConfig(await readFile(out, "utf8"));
    expect(config.capabilities.map((c) => c.id).sort()).toEqual(["REQ-CART", "REQ-LOGIN", "REQ-SEARCH"]);
  });

  it("refuses to overwrite an existing file", async () => {
    const graphFile = join(dir, "graph.json");
    const out = join(dir, "proofkeeper.config.json");
    await writeFile(graphFile, JSON.stringify(graphOf()), "utf8");
    await writeFile(out, "{}\n", "utf8");

    const code = await main(["init", "--graph-file", graphFile, "--out", out]);
    expect(code).toBe(2);
    // The pre-existing file is untouched.
    expect(await readFile(out, "utf8")).toBe("{}\n");
  });

  it("requires a coverage source", async () => {
    expect(await main(["init"])).toBe(2);
  });
});
