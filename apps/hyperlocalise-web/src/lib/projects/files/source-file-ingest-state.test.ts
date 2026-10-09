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
  isSourceFileIngestFailed,
  isSourceFileIngestInProgress,
  sourceFileIngestStates,
} from "./source-file-ingest-state";

describe("isSourceFileIngestInProgress", () => {
  it.each(sourceFileIngestStates)("classifies %s", (state) => {
    expect(isSourceFileIngestInProgress(state)).toBe(state === "pending" || state === "ingesting");
  });

  it("treats missing ingest state as idle", () => {
    expect(isSourceFileIngestInProgress(null)).toBe(false);
    expect(isSourceFileIngestInProgress(undefined)).toBe(false);
  });
});

describe("isSourceFileIngestFailed", () => {
  it.each(sourceFileIngestStates)("classifies %s", (state) => {
    expect(isSourceFileIngestFailed(state)).toBe(state === "failed");
  });

  it("does not treat skipped or missing state as failed", () => {
    expect(isSourceFileIngestFailed("skipped")).toBe(false);
    expect(isSourceFileIngestFailed("ingested")).toBe(false);
    expect(isSourceFileIngestFailed(null)).toBe(false);
    expect(isSourceFileIngestFailed(undefined)).toBe(false);
  });
});
