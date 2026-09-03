/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { calculateAllocationRanges } from "./allocations";

describe("calculateAllocationRanges", () => {
  it("assigns the full bucket range to a single variant at 100%", () => {
    expect(calculateAllocationRanges(10000, [10000])).toEqual([{ start: 0, end: 9999 }]);
  });

  it("splits two equal variants across the experiment rollout", () => {
    expect(calculateAllocationRanges(10000, [5000, 5000])).toEqual([
      { start: 0, end: 4999 },
      { start: 5000, end: 9999 },
    ]);
  });

  it("shrinks the allocated window when the experiment rollout is partial", () => {
    expect(calculateAllocationRanges(5000, [10000])).toEqual([{ start: 0, end: 4999 }]);
  });

  it("returns null for a zero-percent variant", () => {
    expect(calculateAllocationRanges(10000, [0, 10000])).toEqual([
      null,
      { start: 0, end: 9999 },
    ]);
  });
});
