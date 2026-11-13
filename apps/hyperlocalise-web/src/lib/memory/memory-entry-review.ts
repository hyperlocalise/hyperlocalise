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
import { and, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type { Memory } from "@/lib/database/types";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import {
  isMemoryEntryWritable,
  recordMemoryEntryEvent,
  type MemoryEntryReadOnlyReason,
} from "./memory-entry-lifecycle";

export const MEMORY_ENTRY_BULK_REVIEW_LIMIT = 100;

export type MemoryEntryReviewSummary = {
  pending: number;
  rejected: number;
  sameAsSource: number;
};

export type MemoryEntryBulkReviewStatus = "approved" | "rejected";

export type MemoryEntryBulkSelection = {
  id: string;
  version: number;
};

export type MemoryEntryBulkMutationError =
  | { code: "memory_entry_read_only"; reason: MemoryEntryReadOnlyReason }
  | { code: "empty_selection" }
  | { code: "selection_too_large" }
  | { code: "stale_memory_entry" };

function uniqueEntryIds(entryIds: string[]) {
  return [...new Set(entryIds.filter((entryId) => entryId.trim().length > 0))];
}

function uniqueBulkSelections(entries: MemoryEntryBulkSelection[]): MemoryEntryBulkSelection[] {
  const selections = new Map<string, MemoryEntryBulkSelection>();
  for (const entry of entries) {
    if (!entry.id.trim() || selections.has(entry.id)) {
      continue;
    }
    selections.set(entry.id, entry);
  }
  return [...selections.values()];
}

function validateBulkSelection(entryIds: string[]): Result<string[], MemoryEntryBulkMutationError> {
  const uniqueIds = uniqueEntryIds(entryIds);
  if (uniqueIds.length === 0) {
    return err({ code: "empty_selection" });
  }
  if (uniqueIds.length > MEMORY_ENTRY_BULK_REVIEW_LIMIT) {
    return err({ code: "selection_too_large" });
  }
  return ok(uniqueIds);
}

function validateBulkReviewSelection(
  entries: MemoryEntryBulkSelection[],
): Result<MemoryEntryBulkSelection[], MemoryEntryBulkMutationError> {
  const uniqueEntries = uniqueBulkSelections(entries);
  if (uniqueEntries.length === 0) {
    return err({ code: "empty_selection" });
  }
  if (uniqueEntries.length > MEMORY_ENTRY_BULK_REVIEW_LIMIT) {
    return err({ code: "selection_too_large" });
  }
  return ok(uniqueEntries);
}

function writableMemoryOrError(
  memory: Pick<Memory, "source" | "capabilityMode">,
): Result<void, MemoryEntryBulkMutationError> {
  if (isMemoryEntryWritable(memory)) {
    return ok(undefined);
  }
  return err({
    code: "memory_entry_read_only",
    reason: memory.source === "external_tms" ? "external_tms" : "reference_only",
  });
}

function countAsNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function getMemoryEntryReviewSummary(
  memoryId: string,
): Promise<MemoryEntryReviewSummary> {
  const [row] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${schema.memoryEntries.reviewStatus} = 'pending')`,
      rejected: sql<number>`count(*) filter (where ${schema.memoryEntries.reviewStatus} = 'rejected')`,
      sameAsSource: sql<number>`count(*) filter (where ${schema.memoryEntries.sourceText} = ${schema.memoryEntries.targetText})`,
    })
    .from(schema.memoryEntries)
    .where(eq(schema.memoryEntries.memoryId, memoryId));

  return {
    pending: countAsNumber(row?.pending),
    rejected: countAsNumber(row?.rejected),
    sameAsSource: countAsNumber(row?.sameAsSource),
  };
}

export async function bulkReviewMemoryEntries(input: {
  memory: Memory;
  entries: MemoryEntryBulkSelection[];
  reviewStatus: MemoryEntryBulkReviewStatus;
  actorUserId: string;
}): Promise<Result<{ updated: number }, MemoryEntryBulkMutationError>> {
  const writable = writableMemoryOrError(input.memory);
  if (isErr(writable)) {
    return writable;
  }
  const selection = validateBulkReviewSelection(input.entries);
  if (isErr(selection)) {
    return selection;
  }

  return db.transaction(async (tx) => {
    const selectedIds = selection.value.map((entry) => entry.id);
    const current = await tx
      .select({
        id: schema.memoryEntries.id,
        version: schema.memoryEntries.version,
      })
      .from(schema.memoryEntries)
      .where(
        and(
          eq(schema.memoryEntries.memoryId, input.memory.id),
          inArray(schema.memoryEntries.id, selectedIds),
        ),
      )
      .for("update");

    const currentVersionById = new Map(current.map((entry) => [entry.id, entry.version]));
    const hasStaleSelection = selection.value.some(
      (entry) => currentVersionById.get(entry.id) !== entry.version,
    );
    if (hasStaleSelection) {
      return err({ code: "stale_memory_entry" });
    }

    const now = new Date();
    const updated = await tx
      .update(schema.memoryEntries)
      .set({
        reviewStatus: input.reviewStatus,
        reviewedByUserId: input.actorUserId,
        reviewedAt: now,
        modifiedByUserId: input.actorUserId,
        version: sql`${schema.memoryEntries.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.memoryEntries.memoryId, input.memory.id),
          inArray(schema.memoryEntries.id, selectedIds),
        ),
      )
      .returning({
        id: schema.memoryEntries.id,
        version: schema.memoryEntries.version,
      });

    for (const entry of updated) {
      await recordMemoryEntryEvent({
        client: tx,
        memoryEntryId: entry.id,
        memoryId: input.memory.id,
        eventType: "reviewed",
        actorKind: "user",
        actorUserId: input.actorUserId,
        version: entry.version,
        changedFields: ["reviewStatus"],
        attributes: { reviewStatus: input.reviewStatus },
        occurredAt: now,
      });
    }

    return ok({ updated: updated.length });
  });
}

export async function bulkDeleteMemoryEntries(input: {
  memory: Memory;
  entryIds: string[];
}): Promise<Result<{ deleted: number }, MemoryEntryBulkMutationError>> {
  const writable = writableMemoryOrError(input.memory);
  if (isErr(writable)) {
    return writable;
  }
  const selection = validateBulkSelection(input.entryIds);
  if (isErr(selection)) {
    return selection;
  }

  const deleted = await db
    .delete(schema.memoryEntries)
    .where(
      and(
        eq(schema.memoryEntries.memoryId, input.memory.id),
        inArray(schema.memoryEntries.id, selection.value),
      ),
    )
    .returning({ id: schema.memoryEntries.id });

  return ok({ deleted: deleted.length });
}
