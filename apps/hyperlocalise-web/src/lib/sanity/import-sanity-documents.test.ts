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
import { describe, expect, it } from "vitest";

import {
  nextSanityImportWatermark,
  parseSanityDocumentUpdatedAt,
  resolveSanitySourceIngestAction,
} from "./import-sanity-documents";

describe("resolveSanitySourceIngestAction", () => {
  it("reuses ingested unchanged content", () => {
    expect(
      resolveSanitySourceIngestAction({
        sourceContentUnchanged: true,
        latestIngestState: "ingested",
      }),
    ).toBe("reuse");
  });

  it("uploads when content changed", () => {
    expect(
      resolveSanitySourceIngestAction({
        sourceContentUnchanged: false,
        latestIngestState: "ingested",
      }),
    ).toBe("upload");
  });
});

describe("nextSanityImportWatermark", () => {
  it("does not advance past a failed document in the incremental window", () => {
    const previous = new Date("2026-10-11T10:00:00.000Z");
    const failed = new Date("2026-10-11T11:00:00.000Z");
    const succeeded = new Date("2026-10-11T12:00:00.000Z");
    expect(
      nextSanityImportWatermark({
        previous,
        succeededAt: [succeeded],
        failedAt: [failed],
      })?.toISOString(),
    ).toBe(new Date(failed.getTime() - 1).toISOString());
  });

  it("keeps the previous watermark when a failure has no timestamp", () => {
    const previous = new Date("2026-10-11T10:00:00.000Z");
    expect(
      nextSanityImportWatermark({
        previous,
        succeededAt: [new Date("2026-10-11T12:00:00.000Z")],
        failedAt: [],
        failedWithoutTimestamp: true,
      })?.toISOString(),
    ).toBe(previous.toISOString());
  });

  it("advances to the latest success when nothing failed", () => {
    expect(
      nextSanityImportWatermark({
        previous: new Date("2026-10-11T10:00:00.000Z"),
        succeededAt: [new Date("2026-10-11T12:00:00.000Z")],
        failedAt: [],
      })?.toISOString(),
    ).toBe("2026-10-11T12:00:00.000Z");
    expect(parseSanityDocumentUpdatedAt("2026-10-11T12:00:00.000Z")?.toISOString()).toBe(
      "2026-10-11T12:00:00.000Z",
    );
  });
});
