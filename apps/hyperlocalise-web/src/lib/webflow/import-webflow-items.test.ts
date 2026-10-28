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

import { nextWebflowImportWatermark } from "./import-webflow-items";

describe("nextWebflowImportWatermark", () => {
  it("keeps the previous watermark when nothing changed", () => {
    const previous = new Date("2026-10-20T00:00:00.000Z");
    expect(
      nextWebflowImportWatermark({
        previous,
        succeededAt: [],
        failedAt: [],
        failedWithoutTimestamp: false,
        collectionFailed: false,
      }),
    ).toBe(previous);
  });

  it("advances to the newest item timestamp", () => {
    const previous = new Date("2026-10-20T00:00:00.000Z");
    const newest = new Date("2026-10-21T00:00:00.000Z");
    expect(
      nextWebflowImportWatermark({
        previous,
        succeededAt: [new Date("2026-10-19T00:00:00.000Z"), newest],
        failedAt: [],
        failedWithoutTimestamp: false,
        collectionFailed: false,
      }),
    ).toBe(newest);
  });

  it("never moves backwards", () => {
    const previous = new Date("2026-10-22T00:00:00.000Z");
    expect(
      nextWebflowImportWatermark({
        previous,
        succeededAt: [new Date("2026-10-20T00:00:00.000Z")],
        failedAt: [],
        failedWithoutTimestamp: false,
        collectionFailed: false,
      }),
    ).toBe(previous);
  });

  it("holds the watermark when a failure has no timestamp", () => {
    const previous = new Date("2026-10-20T00:00:00.000Z");
    expect(
      nextWebflowImportWatermark({
        previous,
        succeededAt: [new Date("2026-10-25T00:00:00.000Z")],
        failedAt: [],
        failedWithoutTimestamp: true,
        collectionFailed: false,
      }),
    ).toBe(previous);
  });

  it("holds the watermark when a collection fails to load", () => {
    const previous = new Date("2026-10-20T00:00:00.000Z");
    expect(
      nextWebflowImportWatermark({
        previous,
        succeededAt: [new Date("2026-10-25T00:00:00.000Z")],
        failedAt: [],
        failedWithoutTimestamp: false,
        collectionFailed: true,
      }),
    ).toBe(previous);
  });
});
