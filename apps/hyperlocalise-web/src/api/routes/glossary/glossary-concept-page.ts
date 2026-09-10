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
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";
import { buildTranslationMemoryTsQuery } from "@/lib/translation/translation-memory-ts-query";

import type { GlossaryConceptPageQuery } from "./glossary.schema";

type FilterFields = Omit<GlossaryConceptPageQuery, "cursor" | "limit">;

export type GlossaryConceptPageError = {
  code: "invalid_cursor";
  reason: "malformed" | "tampered" | "expired" | "filter_mismatch";
  message: string;
};

type CursorPayload = {
  v: 1;
  glossaryId: string;
  id: string;
  sortValue: string;
  issuedAt: string;
  filterHash: string;
};

const CURSOR_TTL_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cursorSecret() {
  return (
    env.WORKOS_COOKIE_PASSWORD ?? env.PROVIDER_CREDENTIALS_MASTER_KEY ?? "glossary-page-dev-secret"
  );
}

function filterHash(glossaryId: string, filters: FilterFields) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        glossaryId,
        ...filters,
        modifiedFrom: filters.modifiedFrom ?? "",
        modifiedTo: filters.modifiedTo ?? "",
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function sign(encoded: string) {
  return createHmac("sha256", `${cursorSecret()}:glossary-concept-page:v1`)
    .update(encoded)
    .digest("base64url");
}

function encodeCursor(glossaryId: string, filters: FilterFields, id: string, sortValue: string) {
  const payload: CursorPayload = {
    v: 1,
    glossaryId,
    id,
    sortValue,
    issuedAt: new Date().toISOString(),
    filterHash: filterHash(glossaryId, filters),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function decodeCursor(
  cursor: string,
  glossaryId: string,
  filters: FilterFields,
): CursorPayload | GlossaryConceptPageError {
  const parts = cursor.split(".");
  const [encoded, signature] = parts;
  if (parts.length !== 2 || !encoded || !signature)
    return { code: "invalid_cursor", reason: "malformed", message: "Cursor is invalid" };
  const expected = sign(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { code: "invalid_cursor", reason: "tampered", message: "Cursor is invalid" };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { code: "invalid_cursor", reason: "malformed", message: "Cursor is invalid" };
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as CursorPayload).v !== 1 ||
    typeof (payload as CursorPayload).glossaryId !== "string" ||
    typeof (payload as CursorPayload).id !== "string" ||
    typeof (payload as CursorPayload).sortValue !== "string" ||
    typeof (payload as CursorPayload).issuedAt !== "string" ||
    typeof (payload as CursorPayload).filterHash !== "string"
  ) {
    return { code: "invalid_cursor", reason: "malformed", message: "Cursor is invalid" };
  }
  const value = payload as CursorPayload;
  const issuedAt = Date.parse(value.issuedAt);
  if (Number.isNaN(issuedAt) || issuedAt > Date.now() || Date.now() - issuedAt > CURSOR_TTL_MS) {
    return { code: "invalid_cursor", reason: "expired", message: "Cursor is invalid" };
  }
  if (value.glossaryId !== glossaryId || value.filterHash !== filterHash(glossaryId, filters)) {
    return { code: "invalid_cursor", reason: "filter_mismatch", message: "Cursor is invalid" };
  }
  return value;
}

function termExistsWhere(
  conceptId: SQL | typeof schema.glossaryConcepts.id,
  filters: FilterFields,
): SQL | undefined {
  const conditions: SQL[] = [
    eq(schema.glossaryTerms.conceptId, conceptId),
    eq(schema.glossaryTerms.glossaryId, schema.glossaryConcepts.glossaryId),
  ];
  if (filters.locale) conditions.push(eq(schema.glossaryTerms.locale, filters.locale));
  if (filters.termReviewStatus)
    conditions.push(eq(schema.glossaryTerms.reviewStatus, filters.termReviewStatus));
  if (filters.linguisticStatus)
    conditions.push(eq(schema.glossaryTerms.status, filters.linguisticStatus));
  if (filters.provenance) conditions.push(eq(schema.glossaryTerms.provenance, filters.provenance));
  if (filters.caseSensitive !== undefined)
    conditions.push(eq(schema.glossaryTerms.caseSensitive, filters.caseSensitive));
  if (filters.forbidden !== undefined)
    conditions.push(eq(schema.glossaryTerms.forbidden, filters.forbidden));
  if (filters.createdByUserId)
    conditions.push(eq(schema.glossaryTerms.createdByUserId, filters.createdByUserId));
  if (filters.reviewedByUserId)
    conditions.push(eq(schema.glossaryTerms.reviewedByUserId, filters.reviewedByUserId));
  if (filters.importBatchId)
    conditions.push(eq(schema.glossaryTerms.importBatchId, filters.importBatchId));
  if (!filters.includeArchived) conditions.push(sql`${schema.glossaryTerms.archivedAt} is null`);
  return and(...conditions);
}

function buildWhere(glossaryId: string, filters: FilterFields): SQL {
  const conditions: SQL[] = [eq(schema.glossaryConcepts.glossaryId, glossaryId)];
  if (!filters.includeArchived) conditions.push(sql`${schema.glossaryConcepts.archivedAt} is null`);
  if (filters.modifiedFrom)
    conditions.push(gte(schema.glossaryConcepts.updatedAt, new Date(filters.modifiedFrom)));
  if (filters.modifiedTo)
    conditions.push(lte(schema.glossaryConcepts.updatedAt, new Date(filters.modifiedTo)));
  if (filters.reviewStatus)
    conditions.push(eq(schema.glossaryConcepts.reviewStatus, filters.reviewStatus));

  const termWhere = termExistsWhere(schema.glossaryConcepts.id, filters);
  if (
    termWhere &&
    (filters.locale ||
      filters.termReviewStatus ||
      filters.linguisticStatus ||
      filters.provenance ||
      filters.caseSensitive !== undefined ||
      filters.forbidden !== undefined ||
      filters.createdByUserId ||
      filters.reviewedByUserId ||
      filters.importBatchId)
  ) {
    conditions.push(
      exists(
        db.select({ id: schema.glossaryTerms.id }).from(schema.glossaryTerms).where(termWhere),
      ),
    );
  }

  if (filters.search) {
    const search = filters.search.trim();
    const searchTerms: SQL[] = [
      ilike(schema.glossaryConcepts.primaryTerm, `%${search}%`),
      ilike(schema.glossaryConcepts.subject, `%${search}%`),
      ilike(schema.glossaryConcepts.definition, `%${search}%`),
      ilike(schema.glossaryConcepts.note, `%${search}%`),
    ];
    if (UUID_PATTERN.test(search))
      searchTerms.push(eq(schema.glossaryConcepts.id, search.toLowerCase()));
    searchTerms.push(
      exists(
        db
          .select({ id: schema.glossaryTerms.id })
          .from(schema.glossaryTerms)
          .where(
            and(
              eq(schema.glossaryTerms.conceptId, schema.glossaryConcepts.id),
              filters.includeArchived ? undefined : sql`${schema.glossaryTerms.archivedAt} is null`,
              or(
                ilike(schema.glossaryTerms.term, `%${search}%`),
                ilike(schema.glossaryTerms.description, `%${search}%`),
                ilike(schema.glossaryTerms.note, `%${search}%`),
                sql`${schema.glossaryTerms.metadata}::text ilike ${`%${search}%`}`,
                ...(buildTranslationMemoryTsQuery(search)
                  ? [
                      sql`${schema.glossaryTerms.searchVector} @@ to_tsquery('simple', ${buildTranslationMemoryTsQuery(search)})`,
                    ]
                  : []),
              ),
            ),
          ),
      ),
    );
    conditions.push(or(...searchTerms)!);
  }
  return and(...conditions)!;
}

export async function listGlossaryConceptsPage(
  glossaryId: string,
  query: GlossaryConceptPageQuery,
) {
  const { cursor, limit, ...filters } = query;
  const decoded = cursor ? decodeCursor(cursor, glossaryId, filters) : undefined;
  if (decoded && "code" in decoded) return decoded;
  const column =
    filters.sort === "created_at"
      ? schema.glossaryConcepts.createdAt
      : schema.glossaryConcepts.updatedAt;
  const baseWhere = buildWhere(glossaryId, filters);
  const cursorWhere = decoded
    ? filters.sortDir === "asc"
      ? sql`(${column} > ${sql`${decoded.sortValue}::timestamptz`} or (${column} = ${sql`${decoded.sortValue}::timestamptz`} and ${schema.glossaryConcepts.id} > ${decoded.id}))`
      : sql`(${column} < ${sql`${decoded.sortValue}::timestamptz`} or (${column} = ${sql`${decoded.sortValue}::timestamptz`} and ${schema.glossaryConcepts.id} < ${decoded.id}))`
    : undefined;
  const where = cursorWhere ? and(baseWhere, cursorWhere)! : baseWhere;
  const orderBy =
    filters.sortDir === "asc"
      ? [asc(column), asc(schema.glossaryConcepts.id)]
      : [desc(column), desc(schema.glossaryConcepts.id)];
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        concept: schema.glossaryConcepts,
        sortValue: sql<string>`to_char(${column} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(schema.glossaryConcepts)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit + 1),
    db.select({ value: count() }).from(schema.glossaryConcepts).where(baseWhere),
  ]);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const ids = pageRows.map(({ concept }) => concept.id);
  const termCounts = ids.length
    ? await db
        .select({
          conceptId: schema.glossaryTerms.conceptId,
          termCount: count(),
          localeCount: sql<number>`count(distinct ${schema.glossaryTerms.locale})`,
        })
        .from(schema.glossaryTerms)
        .where(
          and(
            inArray(schema.glossaryTerms.conceptId, ids),
            filters.includeArchived ? undefined : sql`${schema.glossaryTerms.archivedAt} is null`,
          ),
        )
        .groupBy(schema.glossaryTerms.conceptId)
    : [];
  const counts = new Map(termCounts.map((row) => [row.conceptId, row]));
  const concepts = pageRows.map(({ concept }) => ({
    id: concept.id,
    glossaryId: concept.glossaryId,
    primaryTerm: concept.primaryTerm,
    subject: concept.subject,
    definition: concept.definition,
    reviewStatus: concept.reviewStatus as "proposed" | "approved" | "rejected" | "superseded",
    termCount: Number(counts.get(concept.id)?.termCount ?? 0),
    localeCount: Number(counts.get(concept.id)?.localeCount ?? 0),
    archivedAt: concept.archivedAt?.toISOString() ?? null,
    createdAt: concept.createdAt.toISOString(),
    updatedAt: concept.updatedAt.toISOString(),
  }));
  const last = pageRows.at(-1);
  return {
    concepts,
    nextCursor:
      hasMore && last ? encodeCursor(glossaryId, filters, last.concept.id, last.sortValue) : null,
    total: totalRows[0]?.value ?? 0,
    pagination: { limit, returned: concepts.length, hasMore },
  };
}
