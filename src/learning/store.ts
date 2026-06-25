/**
 * Failure-learning — Proofkeeper remembers what went wrong so a re-run does not
 * repeat it (Factory automated-qa's "learns from failures"). When a drive does
 * not finish or its compiled test fails the fidelity gate, the run is recorded
 * against the capability; the next drive of that capability is handed the prior
 * reasons so the model can avoid the same dead ends.
 *
 * {@link LearningStore} is pluggable (no hard persistence dependency). The
 * default {@link FileLearningStore} keeps one JSON file per capability under
 * `.proofkeeper/learnings/`; {@link InMemoryLearningStore} is for tests and
 * ephemeral runs.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** A recorded failed attempt at verifying a capability. */
export interface FailureRecord {
  capabilityId: string;
  /** What was attempted, when known. */
  goal?: string;
  /** Why it failed — e.g. "unstable: 1/3 re-runs green" or "drive did not finish". */
  reason: string;
  /** Model turns the drive took, when known. */
  steps?: number;
}

export interface LearningStore {
  recordFailure(record: FailureRecord): Promise<void>;
  /** Prior failures for a capability, oldest first. */
  priorFailures(capabilityId: string): Promise<FailureRecord[]>;
}

/** Deterministic, filesystem-safe slug for a capability id. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "capability";
}

/** Persists failures as one JSON array per capability under a directory. */
export class FileLearningStore implements LearningStore {
  private readonly dir: string;

  constructor(options: { dir?: string } = {}) {
    this.dir = options.dir ?? join(".proofkeeper", "learnings");
  }

  private file(capabilityId: string): string {
    return join(this.dir, `${slug(capabilityId)}.json`);
  }

  async recordFailure(record: FailureRecord): Promise<void> {
    const existing = await this.priorFailures(record.capabilityId);
    existing.push(record);
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(record.capabilityId), JSON.stringify(existing, null, 2) + "\n", "utf8");
  }

  async priorFailures(capabilityId: string): Promise<FailureRecord[]> {
    let text: string;
    try {
      text = await readFile(this.file(capabilityId), "utf8");
    } catch {
      return []; // no history yet
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      return Array.isArray(parsed) ? (parsed as FailureRecord[]) : [];
    } catch {
      return []; // corrupt history is treated as none, never fatal
    }
  }
}

/** An in-memory store for tests and ephemeral runs. */
export class InMemoryLearningStore implements LearningStore {
  private readonly byId = new Map<string, FailureRecord[]>();

  recordFailure(record: FailureRecord): Promise<void> {
    const list = this.byId.get(record.capabilityId) ?? [];
    list.push(record);
    this.byId.set(record.capabilityId, list);
    return Promise.resolve();
  }

  priorFailures(capabilityId: string): Promise<FailureRecord[]> {
    return Promise.resolve([...(this.byId.get(capabilityId) ?? [])]);
  }
}
