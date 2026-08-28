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

import type { MemoryEntryRow } from "./memory-entry-lifecycle";
import { withBaselineAuditEvents, type MemoryEntryAuditEventRecord } from "./memory-entry-detail";

function entry(overrides?: Partial<MemoryEntryRow>): MemoryEntryRow {
  return {
    id: "entry-1",
    memoryId: "memory-1",
    sourceLocale: "en",
    targetLocale: "es",
    sourceText: "Save",
    normalizedSourceText: "save",
    targetText: "Guardar",
    matchScore: 100,
    provenance: "import",
    externalKey: null,
    reviewStatus: "approved",
    version: 2,
    createdByUserId: "user-1",
    modifiedByUserId: "user-2",
    reviewedByUserId: null,
    reviewedAt: null,
    importBatchId: "batch-1",
    metadata: {},
    searchVector: "",
    managementSearchVector: "",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    ...overrides,
  };
}

function event(overrides?: Partial<MemoryEntryAuditEventRecord>): MemoryEntryAuditEventRecord {
  return {
    id: "evt-updated",
    eventType: "updated",
    actorKind: "user",
    actorUserId: "user-2",
    actorDisplayName: "Ada",
    version: 2,
    changedFields: ["targetText"],
    attributes: {},
    occurredAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("withBaselineAuditEvents", () => {
  it("prepends a synthesized creation event when stored rows start at an edit", () => {
    const merged = withBaselineAuditEvents(entry(), [event()]);
    expect(merged.map((item) => item.eventType)).toEqual(["imported", "updated"]);
    expect(merged[0]?.attributes).toEqual({
      provenance: "import",
      importBatchId: "batch-1",
    });
  });

  it("keeps stored creation events unchanged", () => {
    const created = event({
      id: "evt-created",
      eventType: "created",
      occurredAt: "2026-08-01T00:00:00.000Z",
    });
    const updated = event();
    expect(withBaselineAuditEvents(entry({ provenance: "manual" }), [created, updated])).toEqual([
      created,
      updated,
    ]);
  });
});
