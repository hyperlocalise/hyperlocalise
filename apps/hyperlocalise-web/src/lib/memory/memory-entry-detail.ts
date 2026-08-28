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
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { Memory } from "@/lib/database/types";
import type { MemoryEntryEventActorKind, MemoryEntryEventType } from "@/lib/database/schema";

import {
  memoryEntryCapabilities,
  type MemoryEntryCapabilities,
  type MemoryEntryRow,
} from "./memory-entry-lifecycle";

export type MemoryEntryActor = {
  userId: string | null;
  displayName: string | null;
  at: string | null;
  source: "created" | "modified" | "reviewed" | "imported" | "provider";
};

export type MemoryEntryProvenance = {
  origin: string;
  provider: string | null;
  importBatchId: string | null;
  context: string | null;
  created: MemoryEntryActor;
  modified: MemoryEntryActor;
  reviewed: MemoryEntryActor;
  imported: MemoryEntryActor;
  providerSupplied: MemoryEntryActor;
};

export type MemoryEntryVariantRecord = {
  id: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  context: string | null;
  reviewStatus: string;
};

export type MemoryEntryAuditEventRecord = {
  id: string;
  eventType: MemoryEntryEventType;
  actorKind: MemoryEntryEventActorKind;
  actorUserId: string | null;
  actorDisplayName: string | null;
  version: number;
  changedFields: string[];
  attributes: Record<string, unknown>;
  occurredAt: string;
};

export type MemoryEntryDetailRecord = {
  id: string;
  memoryId: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  matchScore: number;
  provenance: string;
  reviewStatus: string;
  version: number;
  externalKey: string | null;
  createdByUserId: string | null;
  modifiedByUserId: string | null;
  reviewedByUserId: string | null;
  importBatchId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

export type MemoryEntryDetail = {
  memoryEntry: MemoryEntryDetailRecord;
  provenance: MemoryEntryProvenance;
  variants: MemoryEntryVariantRecord[];
  auditEvents: MemoryEntryAuditEventRecord[];
  capabilities: MemoryEntryCapabilities;
};

function displayName(firstName: string | null, lastName: string | null) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function providerFrom(entry: MemoryEntryRow, memory: Memory) {
  return (
    stringMetadata(entry.metadata, "provider") ??
    memory.externalProviderKind ??
    (entry.provenance === "sync" ? "external_tms" : null)
  );
}

function actor(input: {
  userId: string | null;
  displayName: string | null;
  at: Date | string | null;
  source: MemoryEntryActor["source"];
}): MemoryEntryActor {
  const at =
    input.at instanceof Date
      ? input.at.toISOString()
      : typeof input.at === "string"
        ? input.at
        : null;
  return {
    userId: input.userId,
    displayName: input.displayName,
    at,
    source: input.source,
  };
}

export function toMemoryEntryDetailRecord(entry: MemoryEntryRow): MemoryEntryDetailRecord {
  return {
    id: entry.id,
    memoryId: entry.memoryId,
    sourceLocale: entry.sourceLocale,
    targetLocale: entry.targetLocale,
    sourceText: entry.sourceText,
    targetText: entry.targetText,
    matchScore: entry.matchScore,
    provenance: entry.provenance,
    reviewStatus: entry.reviewStatus,
    version: entry.version,
    externalKey: entry.externalKey,
    createdByUserId: entry.createdByUserId,
    modifiedByUserId: entry.modifiedByUserId,
    reviewedByUserId: entry.reviewedByUserId,
    importBatchId: entry.importBatchId,
    metadata: entry.metadata ?? {},
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    reviewedAt: entry.reviewedAt?.toISOString() ?? null,
  };
}

async function loadActorNames(userIds: Array<string | null | undefined>) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) {
    return new Map<string, string | null>();
  }

  const rows = await db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(inArray(schema.users.id, ids));

  return new Map(rows.map((row) => [row.id, displayName(row.firstName, row.lastName)]));
}

function synthesizeAuditEvents(entry: MemoryEntryRow): MemoryEntryAuditEventRecord[] {
  const events: MemoryEntryAuditEventRecord[] = [];
  const createdType: MemoryEntryEventType =
    entry.provenance === "import" ? "imported" : entry.provenance === "sync" ? "synced" : "created";
  const createdKind: MemoryEntryEventActorKind =
    entry.provenance === "import" ? "import" : entry.provenance === "sync" ? "provider" : "user";

  events.push({
    id: `${entry.id}:created`,
    eventType: createdType,
    actorKind: createdKind,
    actorUserId: entry.createdByUserId,
    actorDisplayName: null,
    version: 1,
    changedFields: ["sourceLocale", "targetLocale", "sourceText", "targetText"],
    attributes: {
      provenance: entry.provenance,
      ...(entry.importBatchId ? { importBatchId: entry.importBatchId } : {}),
    },
    occurredAt: entry.createdAt.toISOString(),
  });

  if (entry.updatedAt.getTime() > entry.createdAt.getTime()) {
    events.push({
      id: `${entry.id}:updated`,
      eventType: "updated",
      actorKind: "user",
      actorUserId: entry.modifiedByUserId,
      actorDisplayName: null,
      version: entry.version,
      changedFields: [],
      attributes: {},
      occurredAt: entry.updatedAt.toISOString(),
    });
  }

  if (entry.reviewedAt) {
    events.push({
      id: `${entry.id}:reviewed`,
      eventType: "reviewed",
      actorKind: "user",
      actorUserId: entry.reviewedByUserId,
      actorDisplayName: null,
      version: entry.version,
      changedFields: ["reviewStatus"],
      attributes: { reviewStatus: entry.reviewStatus },
      occurredAt: entry.reviewedAt.toISOString(),
    });
  }

  return events.toSorted((left, right) => {
    const byTime = left.occurredAt.localeCompare(right.occurredAt);
    return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
  });
}

async function loadAuditEvents(entry: MemoryEntryRow): Promise<MemoryEntryAuditEventRecord[]> {
  const rows = await db
    .select({
      id: schema.memoryEntryEvents.id,
      eventType: schema.memoryEntryEvents.eventType,
      actorKind: schema.memoryEntryEvents.actorKind,
      actorUserId: schema.memoryEntryEvents.actorUserId,
      version: schema.memoryEntryEvents.version,
      changedFields: schema.memoryEntryEvents.changedFields,
      attributes: schema.memoryEntryEvents.attributes,
      occurredAt: schema.memoryEntryEvents.occurredAt,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.memoryEntryEvents)
    .leftJoin(schema.users, eq(schema.memoryEntryEvents.actorUserId, schema.users.id))
    .where(eq(schema.memoryEntryEvents.memoryEntryId, entry.id))
    .orderBy(asc(schema.memoryEntryEvents.occurredAt), asc(schema.memoryEntryEvents.id));

  if (rows.length === 0) {
    const synthesized = synthesizeAuditEvents(entry);
    const names = await loadActorNames(synthesized.map((event) => event.actorUserId));
    return synthesized.map((event) => ({
      ...event,
      actorDisplayName: event.actorUserId ? (names.get(event.actorUserId) ?? null) : null,
    }));
  }

  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    actorKind: row.actorKind,
    actorUserId: row.actorUserId,
    actorDisplayName: displayName(row.firstName, row.lastName),
    version: row.version,
    changedFields: row.changedFields,
    attributes: row.attributes,
    occurredAt: row.occurredAt.toISOString(),
  }));
}

async function loadVariants(entry: MemoryEntryRow): Promise<MemoryEntryVariantRecord[]> {
  const variantGroupId = stringMetadata(entry.metadata, "variantGroupId");
  const context = stringMetadata(entry.metadata, "context");
  const rows = await db
    .select()
    .from(schema.memoryEntries)
    .where(
      and(
        eq(schema.memoryEntries.memoryId, entry.memoryId),
        ne(schema.memoryEntries.id, entry.id),
        or(
          and(
            eq(schema.memoryEntries.sourceLocale, entry.sourceLocale),
            eq(schema.memoryEntries.normalizedSourceText, entry.normalizedSourceText),
          ),
          variantGroupId
            ? sql`${schema.memoryEntries.metadata} ->> 'variantGroupId' = ${variantGroupId}`
            : sql`false`,
          context
            ? and(
                eq(schema.memoryEntries.normalizedSourceText, entry.normalizedSourceText),
                sql`${schema.memoryEntries.metadata} ->> 'context' = ${context}`,
              )
            : sql`false`,
        ),
      ),
    )
    .orderBy(asc(schema.memoryEntries.targetLocale), asc(schema.memoryEntries.id));

  return rows.map((row) => ({
    id: row.id,
    sourceLocale: row.sourceLocale,
    targetLocale: row.targetLocale,
    sourceText: row.sourceText,
    targetText: row.targetText,
    context: stringMetadata(row.metadata, "context"),
    reviewStatus: row.reviewStatus,
  }));
}

export async function getMemoryEntryDetail(input: {
  memory: Memory;
  entryId: string;
}): Promise<MemoryEntryDetail | null> {
  const [entry] = await db
    .select()
    .from(schema.memoryEntries)
    .where(
      and(
        eq(schema.memoryEntries.id, input.entryId),
        eq(schema.memoryEntries.memoryId, input.memory.id),
      ),
    )
    .limit(1);

  if (!entry) {
    return null;
  }

  const [names, variants, auditEvents] = await Promise.all([
    loadActorNames([entry.createdByUserId, entry.modifiedByUserId, entry.reviewedByUserId]),
    loadVariants(entry),
    loadAuditEvents(entry),
  ]);

  const provider = providerFrom(entry, input.memory);
  const providerAt =
    stringMetadata(entry.metadata, "providerUpdatedAt") ??
    stringMetadata(entry.metadata, "externalUpdatedAt") ??
    (entry.provenance === "sync" ? entry.updatedAt.toISOString() : null);

  return {
    memoryEntry: toMemoryEntryDetailRecord(entry),
    provenance: {
      origin: entry.provenance,
      provider,
      importBatchId: entry.importBatchId,
      context: stringMetadata(entry.metadata, "context"),
      created: actor({
        userId: entry.createdByUserId,
        displayName: entry.createdByUserId ? (names.get(entry.createdByUserId) ?? null) : null,
        at: entry.createdAt,
        source: "created",
      }),
      modified: actor({
        userId: entry.modifiedByUserId,
        displayName: entry.modifiedByUserId ? (names.get(entry.modifiedByUserId) ?? null) : null,
        at: entry.updatedAt,
        source: "modified",
      }),
      reviewed: actor({
        userId: entry.reviewedByUserId,
        displayName: entry.reviewedByUserId ? (names.get(entry.reviewedByUserId) ?? null) : null,
        at: entry.reviewedAt,
        source: "reviewed",
      }),
      imported: actor({
        userId: entry.provenance === "import" ? entry.createdByUserId : null,
        displayName:
          entry.provenance === "import" && entry.createdByUserId
            ? (names.get(entry.createdByUserId) ?? null)
            : null,
        at: entry.provenance === "import" ? entry.createdAt : null,
        source: "imported",
      }),
      providerSupplied: actor({
        userId: null,
        displayName: provider,
        at: providerAt,
        source: "provider",
      }),
    },
    variants,
    auditEvents,
    capabilities: memoryEntryCapabilities(input.memory),
  };
}
