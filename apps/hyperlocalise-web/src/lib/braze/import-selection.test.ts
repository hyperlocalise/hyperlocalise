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

import {
  mergeBrazeImportTargets,
  nextBrazeWatermark,
  shouldListBrazeWithoutWatermark,
} from "./import-selection";

describe("nextBrazeWatermark", () => {
  const previous = new Date("2026-10-01T00:00:00.000Z");
  const success = new Date("2026-10-10T00:00:00.000Z");
  const failed = new Date("2026-10-08T00:00:00.000Z");

  it("advances to the latest success when nothing failed", () => {
    expect(
      nextBrazeWatermark({
        previous,
        successUpdatedAt: [success],
        failedUpdatedAt: [],
      }),
    ).toEqual(success);
  });

  it("does not move past the oldest failure", () => {
    const next = nextBrazeWatermark({
      previous,
      successUpdatedAt: [success],
      failedUpdatedAt: [failed],
    });
    expect(next?.getTime()).toBe(failed.getTime() - 1);
  });

  it("keeps the previous cursor when nothing succeeded and the previous is before the failure", () => {
    expect(
      nextBrazeWatermark({
        previous,
        successUpdatedAt: [],
        failedUpdatedAt: [failed],
      }),
    ).toEqual(previous);
  });
});

describe("mergeBrazeImportTargets", () => {
  it("keeps existing mappings that the watermark omitted", () => {
    const targets = mergeBrazeImportTargets({
      listed: [{ id: "new", name: "New", updatedAt: new Date("2026-10-10T00:00:00.000Z") }],
      existing: [
        {
          sourceId: "old",
          sourceName: "Old",
          sourceUpdatedAt: new Date("2026-09-01T00:00:00.000Z"),
        },
      ],
      filterIds: new Set(),
      knownCopyIds: new Set(),
      suffixes: ["fr-FR"],
    });
    expect(targets.map((item) => item.id).toSorted()).toEqual(["new", "old"]);
  });

  it("honors the picker filter and skips locale copies", () => {
    const targets = mergeBrazeImportTargets({
      listed: [
        { id: "keep", name: "Welcome", updatedAt: null },
        { id: "copy", name: "Welcome_fr-FR", updatedAt: null },
        { id: "other", name: "Other", updatedAt: null },
      ],
      existing: [{ sourceId: "other", sourceName: "Other", sourceUpdatedAt: null }],
      filterIds: new Set(["keep"]),
      knownCopyIds: new Set(),
      suffixes: ["fr-FR"],
    });
    expect(targets.map((item) => item.id)).toEqual(["keep"]);
  });
});

describe("shouldListBrazeWithoutWatermark", () => {
  it("lists the full picker set when IDs are selected", () => {
    expect(shouldListBrazeWithoutWatermark(new Set(["a"]))).toBe(true);
    expect(shouldListBrazeWithoutWatermark(new Set())).toBe(false);
  });
});
