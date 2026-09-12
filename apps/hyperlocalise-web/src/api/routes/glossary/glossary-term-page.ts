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

import { and, asc, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";
import { buildTranslationMemoryTsQuery } from "@/lib/translation/translation-memory-ts-query";

import type { GlossaryTermPageQuery } from "./glossary.schema";

type TermFilters = Omit<GlossaryTermPageQuery, "cursor" | "limit">;
type TermCursor = {
  v: 1;
  glossaryId: string;
  conceptId: string;
  id: string;
  sortValue: string;
  issuedAt: string;
  filterHash: string;
};

export type GlossaryTermPageError = {
  code: "invalid_glossary_term_cursor";
  reason: "malformed" | "tampered" | "expired" | "filter_mismatch";
  message: string;
};

const CURSOR_TTL_MS = 24 * 60 * 60 * 1000;

function secret() {
  return (
    env.WORKOS_COOKIE_PASSWORD ?? env.PROVIDER_CREDENTIALS_MASTER_KEY ?? "glossary-page-dev-secret"
  );
}

function filterHash(glossaryId: string, conceptId: string, filters: TermFilters) {
  return createHash("sha256")
    .update(JSON.stringify({ glossaryId, conceptId, ...filters }))
    .digest("hex")
    .slice(0, 16);
}

function sign(encoded: string) {
  return createHmac("sha256", `${secret()}:glossary-term-page:v1`)
    .update(encoded)
    .digest("base64url");
}

function encodeCursor(
  glossaryId: string,
  conceptId: string,
  filters: TermFilters,
  term: { id: string; sortValue: string },
) {
  const payload: TermCursor = {
    v: 1,
    glossaryId,
    conceptId,
    id: term.id,
    sortValue: term.sortValue,
    issuedAt: new Date().toISOString(),
    filterHash: filterHash(glossaryId, conceptId, filters),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function invalidCursor(
  reason: TermCursor["v"] extends 1 ? GlossaryTermPageError["reason"] : never,
) {
  return {
    code: "invalid_glossary_term_cursor" as const,
    reason,
    message: "Glossary term cursor is invalid",
  };
}

function decodeCursor(
  cursor: string,
  glossaryId: string,
  conceptId: string,
  filters: TermFilters,
): TermCursor | GlossaryTermPageError {
  const [encoded, signature] = cursor.split(".");
  if (!encoded || !signature) return invalidCursor("malformed");
  const expected = sign(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return invalidCursor("tampered");
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return invalidCursor("malformed");
  }
  if (
    !value ||
    typeof value !== "object" ||
    (value as TermCursor).v !== 1 ||
    typeof (value as TermCursor).glossaryId !== "string" ||
    typeof (value as TermCursor).conceptId !== "string" ||
    typeof (value as TermCursor).id !== "string" ||
    typeof (value as TermCursor).sortValue !== "string" ||
    typeof (value as TermCursor).issuedAt !== "string" ||
    typeof (value as TermCursor).filterHash !== "string"
  ) {
    return invalidCursor("malformed");
  }
  const cursorValue = value as TermCursor;
  const issuedAt = Date.parse(cursorValue.issuedAt);
  if (Number.isNaN(issuedAt) || issuedAt > Date.now() || Date.now() - issuedAt > CURSOR_TTL_MS) {
    return invalidCursor("expired");
  }
  if (
    cursorValue.glossaryId !== glossaryId ||
    cursorValue.conceptId !== conceptId ||
    cursorValue.filterHash !== filterHash(glossaryId, conceptId, filters)
  ) {
    return invalidCursor("filter_mismatch");
  }
  return cursorValue;
}

function sortColumn(sort: TermFilters["sort"]) {
  if (sort === "created_at") return schema.glossaryTerms.createdAt;
  if (sort === "term") return schema.glossaryTerms.term;
  if (sort === "locale") return schema.glossaryTerms.locale;
  return schema.glossaryTerms.updatedAt;
}

function sortValueSql(sort: TermFilters["sort"]) {
  const column = sortColumn(sort);
  if (sort === "term" || sort === "locale") return sql<string>`${column}`;
  return sql<string>`to_char(${column} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

function cursorSortValueSql(sort: TermFilters["sort"], value: string) {
  return sort === "term" || sort === "locale" ? sql`${value}` : sql`${value}::timestamptz`;
}

function buildWhere(glossaryId: string, conceptId: string, filters: TermFilters): SQL {
  const conditions: SQL[] = [
    eq(schema.glossaryTerms.glossaryId, glossaryId),
    eq(schema.glossaryTerms.conceptId, conceptId),
  ];
  if (!filters.includeArchived) conditions.push(sql`${schema.glossaryTerms.archivedAt} is null`);
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
  if (filters.partOfSpeech)
    conditions.push(eq(schema.glossaryTerms.partOfSpeech, filters.partOfSpeech));
  if (filters.termType) conditions.push(eq(schema.glossaryTerms.termType, filters.termType));
  if (filters.createdByUserId)
    conditions.push(eq(schema.glossaryTerms.createdByUserId, filters.createdByUserId));
  if (filters.reviewedByUserId)
    conditions.push(eq(schema.glossaryTerms.reviewedByUserId, filters.reviewedByUserId));
  if (filters.importBatchId)
    conditions.push(eq(schema.glossaryTerms.importBatchId, filters.importBatchId));
  if (filters.modifiedFrom)
    conditions.push(gte(schema.glossaryTerms.updatedAt, new Date(filters.modifiedFrom)));
  if (filters.modifiedTo)
    conditions.push(lte(schema.glossaryTerms.updatedAt, new Date(filters.modifiedTo)));
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const tsQuery = buildTranslationMemoryTsQuery(filters.search);
    conditions.push(
      or(
        ilike(schema.glossaryTerms.term, pattern),
        ilike(schema.glossaryTerms.description, pattern),
        ilike(schema.glossaryTerms.note, pattern),
        sql`${schema.glossaryTerms.metadata}::text ILIKE ${pattern}`,
        ...(tsQuery
          ? [sql`${schema.glossaryTerms.searchVector} @@ to_tsquery('simple', ${tsQuery})`]
          : []),
      )!,
    );
  }
  return and(...conditions)!;
}

export async function listGlossaryTermsPage(
  glossaryId: string,
  conceptId: string,
  query: GlossaryTermPageQuery,
) {
  const { cursor, limit, ...filters } = query;
  const decoded = cursor ? decodeCursor(cursor, glossaryId, conceptId, filters) : undefined;
  if (decoded && "code" in decoded) return decoded;

  const column = sortColumn(filters.sort);
  const baseWhere = buildWhere(glossaryId, conceptId, filters);
  const cursorWhere = decoded
    ? filters.sortDir === "asc"
      ? sql`(${column} > ${cursorSortValueSql(filters.sort, decoded.sortValue)} or (${column} = ${cursorSortValueSql(filters.sort, decoded.sortValue)} and ${schema.glossaryTerms.id} > ${decoded.id}))`
      : sql`(${column} < ${cursorSortValueSql(filters.sort, decoded.sortValue)} or (${column} = ${cursorSortValueSql(filters.sort, decoded.sortValue)} and ${schema.glossaryTerms.id} < ${decoded.id}))`
    : undefined;
  const where = cursorWhere ? and(baseWhere, cursorWhere)! : baseWhere;
  const orderBy =
    filters.sortDir === "asc"
      ? [asc(column), asc(schema.glossaryTerms.id)]
      : [desc(column), desc(schema.glossaryTerms.id)];
  const [rows, totalRows] = await Promise.all([
    db
      .select({ term: schema.glossaryTerms, sortValue: sortValueSql(filters.sort) })
      .from(schema.glossaryTerms)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit + 1),
    db.select({ value: count() }).from(schema.glossaryTerms).where(baseWhere),
  ]);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const terms = page.map(({ term }) => term);
  const last = page.at(-1);
  return {
    terms,
    nextCursor:
      hasMore && last
        ? encodeCursor(glossaryId, conceptId, filters, {
            id: last.term.id,
            sortValue: last.sortValue,
          })
        : null,
    total: Number(totalRows[0]?.value ?? 0),
    pagination: { limit, returned: terms.length, hasMore },
  };
}
