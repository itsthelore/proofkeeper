import { describe, expect, it } from "vitest";

import { mapPool } from "../src/qa/concurrency.js";

describe("mapPool", () => {
  it("returns results in input order regardless of completion order", async () => {
    // Earlier items resolve later, so completion order is reversed.
    const out = await mapPool([30, 20, 10], 3, (ms, i) =>
      new Promise<number>((r) => setTimeout(() => r(i), ms)),
    );
    expect(out).toEqual([0, 1, 2]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let inFlight = 0;
    let max = 0;
    await mapPool(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(max).toBe(3);
  });

  it("runs sequentially at limit 1", async () => {
    let inFlight = 0;
    let max = 0;
    await mapPool([1, 2, 3], 1, async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
    });
    expect(max).toBe(1);
  });

  it("handles an empty list", async () => {
    expect(await mapPool([], 3, () => Promise.resolve(1))).toEqual([]);
  });
});
