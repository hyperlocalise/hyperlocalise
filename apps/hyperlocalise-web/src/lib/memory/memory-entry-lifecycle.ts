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
import { and, eq, ne, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import type { Memory } from "@/lib/database/types";
import { createLogger } from "@/lib/log";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import type { MemoryEntryEventActorKind, MemoryEntryEventType } from "@/lib/database/schema";

const logger = createLogger("memory-entry-lifecycle");

export type MemoryEntryRow = typeof schema.memoryEntries.$inferSelect;

export type MemoryEntryReadOnlyReason = "external_tms" | "reference_only";

export type MemoryEntryCapabilities = {
  canEdit: boolean;
  readOnlyReason: MemoryEntryReadOnlyReason | null;
};

export type MemoryEntryMutationError =
  | { code: "memory_entry_not_found" }
  | { code: "memory_entry_read_only"; reason: MemoryEntryReadOnlyReason }
  | { code: "stale_memory_entry"; current: MemoryEntryRow }
  | { code: "duplicate_memory_entry" };

export type RecordMemoryEntryEventInput = {
  memoryEntryId: string;
  memoryId: string;
  eventType: MemoryEntryEventType;
  actorKind: MemoryEntryEventActorKind;
  actorUserId?: string | null;
  version: number;
  changedFields?: string[];
  attributes?: Record<string, unknown>;
  occurredAt?: Date;
};

export type MemoryEntryMutableFields = {
  sourceLocale?: string;
  targetLocale?: string;
  sourceText?: string;
  targetText?: string;
  matchScore?: number;
  reviewStatus?: "approved" | "pending" | "rejected";
  metadata?: Record<string, unknown>;
  provenance?: string;
  externalKey?: string | null;
};

const MUTABLE_FIELD_NAMES = [
  "sourceLocale",
  "targetLocale",
  "sourceText",
  "targetText",
  "matchScore",
  "reviewStatus",
  "metadata",
  "provenance",
  "externalKey",
] as const;

const CREATION_EVENT_TYPES = new Set<MemoryEntryEventType>(["created", "imported", "synced"]);

export function incrementMemoryEntryVersionSql() {
  return sql`${schema.memoryEntries.version} + 1`;
}

export function isMemoryEntryCreationEventType(eventType: string) {
  return CREATION_EVENT_TYPES.has(eventType as MemoryEntryEventType);
}

export function memoryEntryCapabilities(
  memory: Pick<Memory, "source" | "capabilityMode">,
): MemoryEntryCapabilities {
  if (memory.source === "external_tms") {
    return { canEdit: false, readOnlyReason: "external_tms" };
  }
  if (memory.capabilityMode === "reference_only") {
    return { canEdit: false, readOnlyReason: "reference_only" };
  }
  return { canEdit: true, readOnlyReason: null };
}

export function isMemoryEntryWritable(memory: Pick<Memory, "source" | "capabilityMode">) {
  return memoryEntryCapabilities(memory).canEdit;
}

function actorKindForProvenance(provenance: string): MemoryEntryEventActorKind {
  if (provenance === "import") {
    return "import";
  }
  if (provenance === "sync") {
    return "provider";
  }
  return "user";
}

function eventTypeForProvenance(provenance: string): MemoryEntryEventType {
  if (provenance === "import") {
    return "imported";
  }
  if (provenance === "sync") {
    return "synced";
  }
  return "created";
}

const SAFE_EVENT_ATTRIBUTE_KEYS = new Set([
  "importBatchId",
  "provider",
  "provenance",
  "reviewStatus",
  "externalKey",
]);

export function safeMemoryEntryEventAttributes(attributes: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!SAFE_EVENT_ATTRIBUTE_KEYS.has(key) || value === undefined) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safe[key] = value;
    }
  }
  return safe;
}

export async function recordMemoryEntryEvent(
  input: RecordMemoryEntryEventInput & { client?: DatabaseClient },
) {
  const client = input.client ?? db;
  const attributes = safeMemoryEntryEventAttributes(input.attributes);
  const [event] = await client
    .insert(schema.memoryEntryEvents)
    .values({
      memoryEntryId: input.memoryEntryId,
      memoryId: input.memoryId,
      eventType: input.eventType,
      actorKind: input.actorKind,
      actorUserId: input.actorUserId ?? null,
      version: input.version,
      changedFields: input.changedFields ?? [],
      attributes,
      occurredAt: input.occurredAt,
    })
    .returning();

  logger.info("Recorded memory entry event", {
    eventType: input.eventType,
    entryId: input.memoryEntryId,
    memoryId: input.memoryId,
    version: input.version,
    changedFieldCount: (input.changedFields ?? []).length,
  });

  return event;
}

function createdEventValues(input: { entry: MemoryEntryRow; actorUserId?: string | null }) {
  return {
    memoryEntryId: input.entry.id,
    memoryId: input.entry.memoryId,
    eventType: eventTypeForProvenance(input.entry.provenance),
    actorKind: actorKindForProvenance(input.entry.provenance),
    actorUserId: input.actorUserId ?? input.entry.createdByUserId,
    version: input.entry.version,
    changedFields: ["sourceLocale", "targetLocale", "sourceText", "targetText"],
    attributes: safeMemoryEntryEventAttributes({
      provenance: input.entry.provenance,
      reviewStatus: input.entry.reviewStatus,
      ...(input.entry.importBatchId ? { importBatchId: input.entry.importBatchId } : {}),
    }),
    occurredAt: input.entry.createdAt,
  };
}

export async function recordMemoryEntryCreatedEvent(input: {
  entry: MemoryEntryRow;
  actorUserId?: string | null;
  client?: DatabaseClient;
}) {
  const client = input.client ?? db;
  const [event] = await client
    .insert(schema.memoryEntryEvents)
    .values(createdEventValues(input))
    .returning();

  logger.info("Recorded memory entry event", {
    eventType: eventTypeForProvenance(input.entry.provenance),
    entryId: input.entry.id,
    memoryId: input.entry.memoryId,
    version: input.entry.version,
    changedFieldCount: 4,
  });

  return event;
}

export async function recordMemoryEntryCreatedEvents(input: {
  entries: MemoryEntryRow[];
  actorUserId?: string | null;
  client?: DatabaseClient;
}) {
  if (input.entries.length === 0) {
    return [];
  }

  const client = input.client ?? db;
  return client
    .insert(schema.memoryEntryEvents)
    .values(
      input.entries.map((entry) => createdEventValues({ entry, actorUserId: input.actorUserId })),
    );
}

function changedFieldNames(current: MemoryEntryRow, updates: MemoryEntryMutableFields): string[] {
  return MUTABLE_FIELD_NAMES.filter((field) => {
    const next = updates[field];
    if (next === undefined) {
      return false;
    }
    if (field === "metadata") {
      return JSON.stringify(current.metadata) !== JSON.stringify(next);
    }
    return current[field] !== next;
  });
}

export async function updateMemoryEntrySafely(input: {
  memory: Memory;
  entryId: string;
  expectedVersion: number;
  actorUserId?: string | null;
  updates: MemoryEntryMutableFields;
}): Promise<Result<MemoryEntryRow, MemoryEntryMutationError>> {
  const capabilities = memoryEntryCapabilities(input.memory);
  if (!capabilities.canEdit) {
    return err({
      code: "memory_entry_read_only",
      reason: capabilities.readOnlyReason ?? "external_tms",
    });
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.memoryEntries)
      .where(
        and(
          eq(schema.memoryEntries.id, input.entryId),
          eq(schema.memoryEntries.memoryId, input.memory.id),
        ),
      )
      .for("update")
      .limit(1);

    if (!existing) {
      return err({ code: "memory_entry_not_found" });
    }
    if (existing.version !== input.expectedVersion) {
      return err({ code: "stale_memory_entry", current: existing });
    }

    const nextSourceText = input.updates.sourceText ?? existing.sourceText;
    const nextSourceLocale = input.updates.sourceLocale ?? existing.sourceLocale;
    const nextTargetLocale = input.updates.targetLocale ?? existing.targetLocale;
    const nextNormalizedSourceText = normalizeTranslationMemorySourceText(nextSourceText);
    const fields = changedFieldNames(existing, input.updates);

    if (fields.length === 0) {
      return ok(existing);
    }

    if (
      nextNormalizedSourceText !== existing.normalizedSourceText ||
      nextSourceLocale !== existing.sourceLocale ||
      nextTargetLocale !== existing.targetLocale
    ) {
      const [duplicate] = await tx
        .select({ id: schema.memoryEntries.id })
        .from(schema.memoryEntries)
        .where(
          and(
            eq(schema.memoryEntries.memoryId, input.memory.id),
            eq(schema.memoryEntries.sourceLocale, nextSourceLocale),
            eq(schema.memoryEntries.targetLocale, nextTargetLocale),
            eq(schema.memoryEntries.normalizedSourceText, nextNormalizedSourceText),
            ne(schema.memoryEntries.id, existing.id),
          ),
        )
        .limit(1);

      if (duplicate) {
        return err({ code: "duplicate_memory_entry" });
      }
    }

    const nextVersion = existing.version + 1;
    const now = new Date();
    const reviewStatusChanged =
      input.updates.reviewStatus !== undefined &&
      input.updates.reviewStatus !== existing.reviewStatus;

    const [updated] = await tx
      .update(schema.memoryEntries)
      .set({
        ...(input.updates.sourceLocale !== undefined
          ? { sourceLocale: input.updates.sourceLocale }
          : {}),
        ...(input.updates.targetLocale !== undefined
          ? { targetLocale: input.updates.targetLocale }
          : {}),
        ...(input.updates.sourceText !== undefined
          ? {
              sourceText: input.updates.sourceText,
              normalizedSourceText: nextNormalizedSourceText,
            }
          : {}),
        ...(input.updates.targetText !== undefined ? { targetText: input.updates.targetText } : {}),
        ...(input.updates.matchScore !== undefined ? { matchScore: input.updates.matchScore } : {}),
        ...(input.updates.reviewStatus !== undefined
          ? { reviewStatus: input.updates.reviewStatus }
          : {}),
        ...(input.updates.metadata !== undefined ? { metadata: input.updates.metadata } : {}),
        ...(input.updates.provenance !== undefined ? { provenance: input.updates.provenance } : {}),
        ...(input.updates.externalKey !== undefined
          ? { externalKey: input.updates.externalKey }
          : {}),
        version: nextVersion,
        modifiedByUserId: input.actorUserId ?? null,
        ...(reviewStatusChanged
          ? {
              reviewedByUserId: input.actorUserId ?? null,
              reviewedAt: now,
            }
          : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.memoryEntries.id, existing.id),
          eq(schema.memoryEntries.memoryId, input.memory.id),
          eq(schema.memoryEntries.version, existing.version),
        ),
      )
      .returning();

    if (!updated) {
      return err({ code: "stale_memory_entry", current: existing });
    }

    const existingEvents = await tx
      .select({ eventType: schema.memoryEntryEvents.eventType })
      .from(schema.memoryEntryEvents)
      .where(eq(schema.memoryEntryEvents.memoryEntryId, existing.id));
    if (!existingEvents.some((event) => isMemoryEntryCreationEventType(event.eventType))) {
      await tx.insert(schema.memoryEntryEvents).values(
        createdEventValues({
          entry: existing,
          actorUserId: existing.createdByUserId,
        }),
      );
    }

    const contentFields = fields.filter((field) => field !== "reviewStatus");
    if (contentFields.length > 0) {
      await tx.insert(schema.memoryEntryEvents).values({
        memoryEntryId: updated.id,
        memoryId: updated.memoryId,
        eventType: "updated",
        actorKind: "user",
        actorUserId: input.actorUserId ?? null,
        version: nextVersion,
        changedFields: contentFields,
        attributes: safeMemoryEntryEventAttributes({
          provenance: updated.provenance,
        }),
        occurredAt: now,
      });
    }

    if (reviewStatusChanged) {
      await tx.insert(schema.memoryEntryEvents).values({
        memoryEntryId: updated.id,
        memoryId: updated.memoryId,
        eventType: "reviewed",
        actorKind: "user",
        actorUserId: input.actorUserId ?? null,
        version: nextVersion,
        changedFields: ["reviewStatus"],
        attributes: safeMemoryEntryEventAttributes({
          reviewStatus: updated.reviewStatus,
        }),
        occurredAt: new Date(now.getTime() + 1),
      });
    }

    logger.info("Updated memory entry", {
      entryId: updated.id,
      memoryId: updated.memoryId,
      version: updated.version,
      changedFieldCount: fields.length,
    });

    return ok(updated);
  });
}
