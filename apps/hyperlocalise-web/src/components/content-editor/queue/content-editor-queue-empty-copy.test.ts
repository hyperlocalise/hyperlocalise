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

import { resolveContentEditorQueueEmptyCopy } from "./content-editor-queue-empty-copy";

describe("resolveContentEditorQueueEmptyCopy", () => {
  it("keeps search and filter copy ahead of ingest state", () => {
    expect(
      resolveContentEditorQueueEmptyCopy({
        hasSearch: true,
        hasActiveFilter: false,
        ingestState: "pending",
      }).message.defaultMessage,
    ).toMatch(/search/i);
    expect(
      resolveContentEditorQueueEmptyCopy({
        hasSearch: false,
        hasActiveFilter: true,
        ingestState: "failed",
        ingestError: "boom",
      }).message.defaultMessage,
    ).toMatch(/filter/i);
  });

  it("shows extracting copy while ingest is pending or running", () => {
    expect(
      resolveContentEditorQueueEmptyCopy({
        hasSearch: false,
        hasActiveFilter: false,
        ingestState: "pending",
      }).message.defaultMessage,
    ).toBe("Extracting segments…");
    expect(
      resolveContentEditorQueueEmptyCopy({
        hasSearch: false,
        hasActiveFilter: false,
        ingestState: "ingesting",
      }).message.defaultMessage,
    ).toBe("Extracting segments…");
  });

  it("surfaces ingest errors instead of an empty queue", () => {
    expect(
      resolveContentEditorQueueEmptyCopy({
        hasSearch: false,
        hasActiveFilter: false,
        ingestState: "failed",
        ingestError: "sandbox install failed",
      }),
    ).toMatchObject({
      message: { defaultMessage: "Segment extraction failed: {error}" },
      values: { error: "sandbox install failed" },
    });
    expect(
      resolveContentEditorQueueEmptyCopy({
        hasSearch: false,
        hasActiveFilter: false,
        ingestState: "failed",
      }).message.defaultMessage,
    ).toBe("Segment extraction failed.");
  });

  it("keeps the empty-queue line after a successful ingest with no keys", () => {
    expect(
      resolveContentEditorQueueEmptyCopy({
        hasSearch: false,
        hasActiveFilter: false,
        ingestState: "ingested",
      }).message.defaultMessage,
    ).toBe("No segments in queue.");
  });
});
