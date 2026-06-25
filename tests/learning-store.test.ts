import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileLearningStore, InMemoryLearningStore } from "../src/learning/store.js";

describe("FileLearningStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pk-learn-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns no prior failures before anything is recorded", async () => {
    const store = new FileLearningStore({ dir });
    expect(await store.priorFailures("REQ-A")).toEqual([]);
  });

  it("records failures and reads them back, oldest first", async () => {
    const store = new FileLearningStore({ dir });
    await store.recordFailure({ capabilityId: "REQ-A", reason: "unstable: 1/3", steps: 4 });
    await store.recordFailure({ capabilityId: "REQ-A", reason: "drive did not finish", steps: 12 });
    const failures = await store.priorFailures("REQ-A");
    expect(failures.map((f) => f.reason)).toEqual(["unstable: 1/3", "drive did not finish"]);
  });

  it("isolates failures per capability", async () => {
    const store = new FileLearningStore({ dir });
    await store.recordFailure({ capabilityId: "REQ-A", reason: "a-fail" });
    await store.recordFailure({ capabilityId: "REQ-B", reason: "b-fail" });
    expect((await store.priorFailures("REQ-A")).map((f) => f.reason)).toEqual(["a-fail"]);
    expect((await store.priorFailures("REQ-B")).map((f) => f.reason)).toEqual(["b-fail"]);
  });

  it("treats a corrupt history file as empty, never throwing", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "req-a.json"), "{ not json", "utf8");
    const store = new FileLearningStore({ dir });
    expect(await store.priorFailures("REQ-A")).toEqual([]);
  });
});

describe("InMemoryLearningStore", () => {
  it("records and returns failures, isolated per capability", async () => {
    const store = new InMemoryLearningStore();
    await store.recordFailure({ capabilityId: "REQ-A", reason: "x" });
    await store.recordFailure({ capabilityId: "REQ-A", reason: "y" });
    expect((await store.priorFailures("REQ-A")).map((f) => f.reason)).toEqual(["x", "y"]);
    expect(await store.priorFailures("REQ-B")).toEqual([]);
  });
});
