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

import { isErr } from "@/lib/primitives/result/results";

import {
  MEMORY_ENTRY_BULK_REVIEW_LIMIT,
  bulkDeleteMemoryEntries,
  bulkReviewMemoryEntries,
} from "./memory-entry-review";

const nativeMemory = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  createdByUserId: null,
  name: "Project TM",
  description: "",
  status: "active" as const,
  source: "native" as const,
  externalProviderKind: null,
  externalProviderCredentialId: null,
  externalProjectId: null,
  externalMemoryId: null,
  localeCoverage: [],
  segmentCount: null,
  syncState: null,
  capabilityMode: null,
  segmentCapabilities: {},
  externalUrl: null,
  lastSyncedAt: null,
  lastSyncErrorAt: null,
  lastSyncErrorMessage: null,
  providerMetadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("memory entry review helpers", () => {
  it("rejects empty and oversized bulk selections before touching the database", async () => {
    const empty = await bulkReviewMemoryEntries({
      memory: nativeMemory,
      entries: [],
      reviewStatus: "approved",
      actorUserId: "33333333-3333-4333-8333-333333333333",
    });
    expect(isErr(empty)).toBe(true);
    if (isErr(empty)) {
      expect(empty.error.code).toBe("empty_selection");
    }

    const oversized = await bulkDeleteMemoryEntries({
      memory: nativeMemory,
      entryIds: Array.from({ length: MEMORY_ENTRY_BULK_REVIEW_LIMIT + 1 }, (_, index) => {
        const suffix = String(index).padStart(12, "0");
        return `44444444-4444-4444-8444-${suffix}`;
      }),
    });
    expect(isErr(oversized)).toBe(true);
    if (isErr(oversized)) {
      expect(oversized.error.code).toBe("selection_too_large");
    }
  });

  it("treats external memories as read-only", async () => {
    const result = await bulkReviewMemoryEntries({
      memory: {
        ...nativeMemory,
        source: "external_tms",
        capabilityMode: "synced_import",
      },
      entries: [{ id: "55555555-5555-4555-8555-555555555555", version: 1 }],
      reviewStatus: "approved",
      actorUserId: "33333333-3333-4333-8333-333333333333",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "memory_entry_read_only",
        reason: "external_tms",
      });
    }
  });
});
