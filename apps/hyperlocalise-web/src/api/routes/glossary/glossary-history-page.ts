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

import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";

import type { GlossaryHistoryQuery } from "./glossary.schema";

const CURSOR_TTL_MS = 24 * 60 * 60 * 1000;

type HistoryFilters = Omit<GlossaryHistoryQuery, "cursor" | "limit">;

type HistoryCursor = {
  v: 1;
  glossaryId: string;
  occurredAt: string;
  id: string;
  filterHash: string;
  issuedAt: string;
};

export type GlossaryHistoryPageError = {
  code: "invalid_glossary_history_cursor";
  reason: "malformed" | "tampered" | "expired" | "filter_mismatch";
  message: string;
};

function cursorSecret() {
  return (
    env.WORKOS_COOKIE_PASSWORD ?? env.PROVIDER_CREDENTIALS_MASTER_KEY ?? "glossary-page-dev-secret"
  );
}

function filterHash(glossaryId: string, filters: HistoryFilters) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        glossaryId,
        conceptId: filters.conceptId ?? null,
        termId: filters.termId ?? null,
        search: filters.search ?? null,
        eventType: filters.eventType ?? null,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function sign(encoded: string) {
  return createHmac("sha256", `${cursorSecret()}:glossary-history-page:v1`)
    .update(encoded)
    .digest("base64url");
}

function encodeCursor(
  glossaryId: string,
  filters: HistoryFilters,
  event: { id: string; occurredAt: Date },
) {
  const payload: HistoryCursor = {
    v: 1,
    glossaryId,
    occurredAt: event.occurredAt.toISOString(),
    id: event.id,
    filterHash: filterHash(glossaryId, filters),
    issuedAt: new Date().toISOString(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function invalidCursor(reason: GlossaryHistoryPageError["reason"]): GlossaryHistoryPageError {
  return {
    code: "invalid_glossary_history_cursor",
    reason,
    message: "Glossary history cursor is invalid",
  };
}

function decodeCursor(
  cursor: string,
  glossaryId: string,
  filters: HistoryFilters,
): HistoryCursor | GlossaryHistoryPageError {
  const parts = cursor.split(".");
  const [encoded, signature] = parts;
  if (parts.length !== 2 || !encoded || !signature) return invalidCursor("malformed");

  const expected = sign(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return invalidCursor("tampered");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return invalidCursor("malformed");
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as HistoryCursor).v !== 1 ||
    typeof (payload as HistoryCursor).glossaryId !== "string" ||
    typeof (payload as HistoryCursor).occurredAt !== "string" ||
    typeof (payload as HistoryCursor).id !== "string" ||
    typeof (payload as HistoryCursor).filterHash !== "string" ||
    typeof (payload as HistoryCursor).issuedAt !== "string"
  ) {
    return invalidCursor("malformed");
  }

  const value = payload as HistoryCursor;
  const occurredAt = Date.parse(value.occurredAt);
  const issuedAt = Date.parse(value.issuedAt);
  if (
    Number.isNaN(occurredAt) ||
    Number.isNaN(issuedAt) ||
    issuedAt > Date.now() ||
    Date.now() - issuedAt > CURSOR_TTL_MS
  ) {
    return invalidCursor("expired");
  }
  if (value.glossaryId !== glossaryId || value.filterHash !== filterHash(glossaryId, filters)) {
    return invalidCursor("filter_mismatch");
  }
  return value;
}

export function actorDisplayName(
  actorKind: string,
  actorUserId: string | null,
  firstName: string | null,
  lastName: string | null,
  email: string | null = null,
) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  // ON DELETE SET NULL clears actorUserId when the user row is removed.
  if (actorKind === "user" && !actorUserId) return "Deleted user";
  if (email) return email;
  return actorKind;
}

export async function listGlossaryHistoryPage(glossaryId: string, query: GlossaryHistoryQuery) {
  const { cursor, limit, ...filters } = query;
  const decoded = cursor ? decodeCursor(cursor, glossaryId, filters) : undefined;
  if (decoded && "code" in decoded) return decoded;

  const conditions = [eq(schema.glossaryHistoryEvents.glossaryId, glossaryId)];
  if (filters.conceptId) {
    conditions.push(eq(schema.glossaryHistoryEvents.conceptId, filters.conceptId));
  }
  if (filters.termId) {
    conditions.push(eq(schema.glossaryHistoryEvents.termId, filters.termId));
  }
  if (filters.eventType) {
    conditions.push(eq(schema.glossaryHistoryEvents.eventType, filters.eventType));
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(schema.glossaryHistoryEvents.eventType, pattern),
        ilike(schema.glossaryHistoryEvents.actorKind, pattern),
        ilike(schema.glossaryHistoryEvents.reason, pattern),
        ilike(schema.users.firstName, pattern),
        ilike(schema.users.lastName, pattern),
        sql`${schema.glossaryHistoryEvents.changedFields}::text ILIKE ${pattern}`,
        sql`${schema.glossaryHistoryEvents.changes}::text ILIKE ${pattern}`,
        sql`${schema.glossaryHistoryEvents.attributes}::text ILIKE ${pattern}`,
      )!,
    );
  }
  if (decoded) {
    const occurredAt = new Date(decoded.occurredAt);
    conditions.push(
      or(
        lt(schema.glossaryHistoryEvents.occurredAt, occurredAt),
        and(
          eq(schema.glossaryHistoryEvents.occurredAt, occurredAt),
          lt(schema.glossaryHistoryEvents.id, decoded.id),
        ),
      )!,
    );
  }

  const rows = await db
    .select({
      event: schema.glossaryHistoryEvents,
      actorFirstName: schema.users.firstName,
      actorLastName: schema.users.lastName,
      actorEmail: schema.users.email,
    })
    .from(schema.glossaryHistoryEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.glossaryHistoryEvents.actorUserId))
    .where(and(...conditions))
    .orderBy(desc(schema.glossaryHistoryEvents.occurredAt), desc(schema.glossaryHistoryEvents.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const events = page.map(({ event, actorFirstName, actorLastName, actorEmail }) => ({
    id: event.id,
    conceptId: event.conceptId,
    termId: event.termId,
    eventType: event.eventType,
    actorKind: event.actorKind,
    actorUserId: event.actorUserId,
    actorCredentialId: event.actorCredentialId,
    actorDisplayName: actorDisplayName(
      event.actorKind,
      event.actorUserId,
      actorFirstName,
      actorLastName,
      actorEmail,
    ),
    version: event.version,
    reason: event.reason,
    changedFields: event.changedFields,
    changes: event.changes,
    attributes: event.attributes,
    occurredAt: event.occurredAt.toISOString(),
  }));

  const last = page.at(-1)?.event;
  return {
    events,
    nextCursor: hasMore && last ? encodeCursor(glossaryId, filters, last) : null,
    pagination: { limit, returned: events.length, hasMore },
  };
}
