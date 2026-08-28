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
import { and, asc, count, desc, eq, gte, lte, or, sql, type SQL } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { isErr, ok, type Result } from "@/lib/primitives/result/results";
import { buildTranslationMemoryTsQuery } from "@/lib/translation/translation-memory-ts-query";

import {
  decodeMemoryEntryCursor,
  encodeMemoryEntryCursor,
  type MemoryEntryCursorError,
  type MemoryEntryListFilterFields,
} from "./memory-entry-cursor";
import type { ListMemoryEntriesQuery } from "./memory.schema";

type MemoryEntry = typeof schema.memoryEntries.$inferSelect;

const ENTRY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MemoryEntryListPagination = {
  limit: number;
  returned: number;
  hasMore: boolean;
};

export type MemoryEntryListPage = {
  entries: MemoryEntry[];
  nextCursor: string | null;
  total: number;
  pagination: MemoryEntryListPagination;
};

export function memoryEntryListFiltersFromQuery(
  query?: ListMemoryEntriesQuery,
): MemoryEntryListFilterFields {
  return {
    search: query?.search,
    sourceLocale: query?.sourceLocale,
    targetLocale: query?.targetLocale,
    reviewStatus: query?.reviewStatus,
    origin: query?.origin,
    provider: query?.provider,
    createdByUserId: query?.createdByUserId,
    modifiedFrom: query?.modifiedFrom,
    modifiedTo: query?.modifiedTo,
    importBatchId: query?.importBatchId,
    sort: query?.sort ?? "created_at",
    sortDir: query?.sortDir ?? "desc",
  };
}

function buildSearchCondition(search: string): SQL | undefined {
  const trimmed = search.trim();
  if (!trimmed) {
    return undefined;
  }

  const conditions: SQL[] = [];
  if (ENTRY_ID_PATTERN.test(trimmed)) {
    conditions.push(eq(schema.memoryEntries.id, trimmed.toLowerCase()));
  }

  conditions.push(eq(schema.memoryEntries.externalKey, trimmed));

  const tsQuery = buildTranslationMemoryTsQuery(trimmed);
  if (tsQuery) {
    conditions.push(
      sql`${schema.memoryEntries.managementSearchVector} @@ to_tsquery('simple', ${tsQuery})`,
    );
  }

  return or(...conditions);
}

export function buildMemoryEntryListWhere(
  memoryId: string,
  filters: MemoryEntryListFilterFields,
): SQL {
  const conditions: SQL[] = [eq(schema.memoryEntries.memoryId, memoryId)];

  if (filters.sourceLocale) {
    conditions.push(eq(schema.memoryEntries.sourceLocale, filters.sourceLocale));
  }
  if (filters.targetLocale) {
    conditions.push(eq(schema.memoryEntries.targetLocale, filters.targetLocale));
  }
  if (filters.reviewStatus) {
    conditions.push(eq(schema.memoryEntries.reviewStatus, filters.reviewStatus));
  }
  if (filters.origin) {
    conditions.push(eq(schema.memoryEntries.provenance, filters.origin));
  }
  if (filters.provider) {
    conditions.push(
      or(
        eq(schema.memoryEntries.provenance, filters.provider),
        sql`${schema.memoryEntries.metadata} ->> 'provider' = ${filters.provider}`,
      )!,
    );
  }
  if (filters.createdByUserId) {
    conditions.push(eq(schema.memoryEntries.createdByUserId, filters.createdByUserId));
  }
  if (filters.importBatchId) {
    conditions.push(eq(schema.memoryEntries.importBatchId, filters.importBatchId));
  }
  if (filters.modifiedFrom) {
    conditions.push(gte(schema.memoryEntries.updatedAt, new Date(filters.modifiedFrom)));
  }
  if (filters.modifiedTo) {
    conditions.push(lte(schema.memoryEntries.updatedAt, new Date(filters.modifiedTo)));
  }
  if (filters.search) {
    const searchCondition = buildSearchCondition(filters.search);
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  return and(...conditions)!;
}

function sortColumn(sort: MemoryEntryListFilterFields["sort"]) {
  return sort === "updated_at" ? schema.memoryEntries.updatedAt : schema.memoryEntries.createdAt;
}

function timestampCursorSql(column: ReturnType<typeof sortColumn>) {
  // node-postgres Date objects drop Postgres microseconds. Render UTC text so the
  // cursor can compare the original timestamptz value.
  return sql<string>`to_char(${column} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

function buildKeysetWhere(
  filters: MemoryEntryListFilterFields,
  cursor: { sortValue: string; id: string },
): SQL {
  const column = sortColumn(filters.sort);
  const cursorTs = sql`${cursor.sortValue}::timestamptz`;

  if (filters.sortDir === "asc") {
    return sql`(${column} > ${cursorTs} or (${column} = ${cursorTs} and ${schema.memoryEntries.id} > ${cursor.id}))`;
  }

  return sql`(${column} < ${cursorTs} or (${column} = ${cursorTs} and ${schema.memoryEntries.id} < ${cursor.id}))`;
}

export async function listMemoryEntriesPage(
  memoryId: string,
  query?: ListMemoryEntriesQuery,
): Promise<Result<MemoryEntryListPage, MemoryEntryCursorError>> {
  const limit = query?.limit ?? 50;
  const filters = memoryEntryListFiltersFromQuery(query);
  const filterWhere = buildMemoryEntryListWhere(memoryId, filters);

  let keysetWhere: SQL | undefined;
  if (query?.cursor) {
    const decoded = decodeMemoryEntryCursor(query.cursor, filters);
    if (isErr(decoded)) {
      return decoded;
    }
    keysetWhere = buildKeysetWhere(filters, decoded.value);
  }

  const where = keysetWhere ? and(filterWhere, keysetWhere)! : filterWhere;
  const column = sortColumn(filters.sort);
  const orderBy =
    filters.sortDir === "asc"
      ? [asc(column), asc(schema.memoryEntries.id)]
      : [desc(column), desc(schema.memoryEntries.id)];

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        entry: schema.memoryEntries,
        sortValueCursor: timestampCursorSql(column),
      })
      .from(schema.memoryEntries)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit + 1),
    db.select({ value: count() }).from(schema.memoryEntries).where(filterWhere),
  ]);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const entries = pageRows.map((row) => row.entry);
  const lastRow = pageRows.at(-1);
  const nextCursor =
    hasMore && lastRow
      ? encodeMemoryEntryCursor({
          filters,
          id: lastRow.entry.id,
          sortValue: lastRow.sortValueCursor,
        })
      : null;

  return ok({
    entries,
    nextCursor,
    total: totalRow[0]?.value ?? 0,
    pagination: {
      limit,
      returned: entries.length,
      hasMore,
    },
  });
}
