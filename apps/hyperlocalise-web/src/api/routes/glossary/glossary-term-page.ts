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

import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";
import type { GlossaryTermPageQuery } from "./glossary.schema";

type Filters = Omit<GlossaryTermPageQuery, "cursor" | "limit">;
type Cursor = {
  v: 1;
  glossaryId: string;
  id: string;
  sortValue: string;
  issuedAt: string;
  filterHash: string;
};

const TTL = 24 * 60 * 60 * 1000;

function secret() {
  return (
    env.WORKOS_COOKIE_PASSWORD ?? env.PROVIDER_CREDENTIALS_MASTER_KEY ?? "glossary-page-dev-secret"
  );
}

function hash(glossaryId: string, filters: Filters) {
  return createHash("sha256")
    .update(JSON.stringify({ glossaryId, ...filters }))
    .digest("hex")
    .slice(0, 16);
}

function encode(glossaryId: string, filters: Filters, term: { id: string; sortValue: string }) {
  const payload: Cursor = {
    v: 1,
    glossaryId,
    id: term.id,
    sortValue: term.sortValue,
    issuedAt: new Date().toISOString(),
    filterHash: hash(glossaryId, filters),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", `${secret()}:glossary-term-page:v1`)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function decode(
  value: string,
  glossaryId: string,
  filters: Filters,
): Cursor | { code: "invalid_cursor"; message: string } {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return { code: "invalid_cursor", message: "Cursor is invalid" };
  const expected = createHmac("sha256", `${secret()}:glossary-term-page:v1`)
    .update(encoded)
    .digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return { code: "invalid_cursor", message: "Cursor is invalid" };
  try {
    const cursor = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Cursor;
    const issuedAt = Date.parse(cursor.issuedAt);
    if (
      cursor.v !== 1 ||
      cursor.glossaryId !== glossaryId ||
      cursor.filterHash !== hash(glossaryId, filters) ||
      Number.isNaN(issuedAt) ||
      issuedAt > Date.now() ||
      Date.now() - issuedAt > TTL
    ) {
      return { code: "invalid_cursor", message: "Cursor is invalid" };
    }
    return cursor;
  } catch {
    return { code: "invalid_cursor", message: "Cursor is invalid" };
  }
}

function sortColumn(sort: Filters["sort"]) {
  if (sort === "created_at") return schema.glossaryTerms.createdAt;
  if (sort === "term") return schema.glossaryTerms.term;
  return schema.glossaryTerms.updatedAt;
}

function whereFor(glossaryId: string, conceptId: string | undefined, filters: Filters): SQL {
  const conditions: SQL[] = [eq(schema.glossaryTerms.glossaryId, glossaryId)];
  if (conceptId) conditions.push(eq(schema.glossaryTerms.conceptId, conceptId));
  if (!filters.includeArchived) conditions.push(sql`${schema.glossaryTerms.archivedAt} is null`);
  if (filters.locale) conditions.push(eq(schema.glossaryTerms.locale, filters.locale));
  if (filters.reviewStatus)
    conditions.push(eq(schema.glossaryTerms.reviewStatus, filters.reviewStatus));
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(schema.glossaryTerms.term, pattern),
        ilike(schema.glossaryTerms.sourceTerm, pattern),
        ilike(schema.glossaryTerms.targetTerm, pattern),
        ilike(schema.glossaryTerms.description, pattern),
        ilike(schema.glossaryTerms.note, pattern),
        sql`${schema.glossaryTerms.metadata}::text ilike ${pattern}`,
      )!,
    );
  }
  return and(...conditions)!;
}

export async function listGlossaryTermsPage(
  glossaryId: string,
  query: GlossaryTermPageQuery,
  conceptId?: string,
) {
  const { cursor, limit, ...filters } = query;
  const decoded = cursor ? decode(cursor, glossaryId, filters) : undefined;
  if (decoded && "code" in decoded) return decoded;
  const column = sortColumn(filters.sort);
  const baseWhere = whereFor(glossaryId, conceptId, filters);
  const cursorWhere = decoded
    ? filters.sortDir === "asc"
      ? sql`(${column} > ${decoded.sortValue} or (${column} = ${decoded.sortValue} and ${schema.glossaryTerms.id} > ${decoded.id}))`
      : sql`(${column} < ${decoded.sortValue} or (${column} = ${decoded.sortValue} and ${schema.glossaryTerms.id} < ${decoded.id}))`
    : undefined;
  const where = cursorWhere ? and(baseWhere, cursorWhere)! : baseWhere;
  const orderBy =
    filters.sortDir === "asc"
      ? [asc(column), asc(schema.glossaryTerms.id)]
      : [desc(column), desc(schema.glossaryTerms.id)];
  const [rows, totalRows] = await Promise.all([
    db
      .select({ term: schema.glossaryTerms, sortValue: sql<string>`${column}` })
      .from(schema.glossaryTerms)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit + 1),
    db.select({ value: count() }).from(schema.glossaryTerms).where(baseWhere),
  ]);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const terms = page.map(({ term }) => ({
    id: term.id,
    glossaryId: term.glossaryId,
    conceptId: term.conceptId,
    locale: term.locale,
    term: term.term,
    description: term.description,
    note: term.note,
    reviewStatus: term.reviewStatus as "proposed" | "approved" | "rejected" | "superseded",
    provenance: term.provenance,
    version: term.version,
    archivedAt: term.archivedAt?.toISOString() ?? null,
    createdAt: term.createdAt.toISOString(),
    updatedAt: term.updatedAt.toISOString(),
  }));
  const last = page.at(-1);
  return {
    terms,
    nextCursor: hasMore
      ? encode(glossaryId, filters, { id: last!.term.id, sortValue: last!.sortValue })
      : null,
    total: Number(totalRows[0]?.value ?? 0),
    pagination: { limit, returned: terms.length, hasMore },
  };
}
