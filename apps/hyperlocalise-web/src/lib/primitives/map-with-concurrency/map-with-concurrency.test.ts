import { describe, expect, it, vi } from "vite-plus/test";

import { mapWithConcurrency } from "./map-with-concurrency";

describe("mapWithConcurrency", () => {
  it("aborts remaining workers when a mapper throws", async () => {
    const mapper = vi.fn(async (item: number) => {
      if (item === 0) {
        throw new Error("fail");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      return item;
    });

    await expect(mapWithConcurrency([0, 1, 2, 3, 4, 5], 3, mapper)).rejects.toThrow("fail");

    expect(mapper).toHaveBeenCalledTimes(3);
  });
});
