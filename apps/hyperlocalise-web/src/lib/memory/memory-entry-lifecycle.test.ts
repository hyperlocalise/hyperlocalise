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
  isMemoryEntryWritable,
  memoryEntryCapabilities,
  safeMemoryEntryEventAttributes,
} from "./memory-entry-lifecycle";

describe("memoryEntryCapabilities", () => {
  it("allows edits on native writable memories", () => {
    expect(
      memoryEntryCapabilities({
        source: "native",
        capabilityMode: null,
      }),
    ).toEqual({ canEdit: true, readOnlyReason: null });
  });

  it("treats external memories as read-only", () => {
    expect(
      memoryEntryCapabilities({
        source: "external_tms",
        capabilityMode: "synced_import",
      }),
    ).toEqual({ canEdit: false, readOnlyReason: "external_tms" });
    expect(
      isMemoryEntryWritable({
        source: "external_tms",
        capabilityMode: "live_search",
      }),
    ).toBe(false);
  });

  it("treats reference-only memories as read-only", () => {
    expect(
      memoryEntryCapabilities({
        source: "native",
        capabilityMode: "reference_only",
      }),
    ).toEqual({ canEdit: false, readOnlyReason: "reference_only" });
  });
});

describe("safeMemoryEntryEventAttributes", () => {
  it("keeps identifiers and drops raw linguistic content", () => {
    expect(
      safeMemoryEntryEventAttributes({
        importBatchId: "batch-1",
        reviewStatus: "approved",
        sourceText: "Save",
        targetText: "Guardar",
        payload: { sourceText: "Save" },
      }),
    ).toEqual({
      importBatchId: "batch-1",
      reviewStatus: "approved",
    });
  });
});
