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
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import type { ActivityActorKind } from "@/lib/activity-log/activity-log-contract";
import { db, schema } from "@/lib/database/client";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";

export const CONTENT_EDITOR_ACTIVITY_EVENT_TYPES = [
  "file_uploaded",
  "file_translations_imported",
  "string_segment_translation_updated",
  "string_segment_approved",
  "string_segment_status_changed",
  "string_segment_hidden",
  "string_segment_unhidden",
  "string_segment_locked",
  "string_segment_unlocked",
  "string_segment_commented",
] as const;

export type ContentEditorActivityLogItem = {
  actor: {
    credentialId: string | null;
    displayName: string;
    kind: string;
    userId: string | null;
  };
  createdAt: string;
  eventType: string;
  id: string;
  payload: Record<string, unknown>;
  target: { displayName: string | null; href: string | null; id: string; kind: string };
};

/** `createdAt` is Postgres' text form of the timestamp: a JavaScript Date would drop microseconds. */
type ActivityLogCursor = { createdAt: string; id: string };

const CURSOR_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/;
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encodeCursor(cursor: ActivityLogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string): ActivityLogCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const { createdAt, id } = parsed as Partial<ActivityLogCursor>;
  if (
    typeof createdAt !== "string" ||
    typeof id !== "string" ||
    !CURSOR_TIMESTAMP.test(createdAt) ||
    !CURSOR_ID.test(id)
  ) {
    return null;
  }
  return { createdAt, id };
}

function personName(firstName: string | null, lastName: string | null): string {
  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ");
  return name || "Deleted user";
}

function actorDisplayName(kind: string, firstName: string | null, lastName: string | null) {
  switch (kind) {
    case "system":
      return "System";
    case "agent":
      return "Agent";
    case "api_key":
      return firstName || lastName ? personName(firstName, lastName) : "API credential";
    default:
      return personName(firstName, lastName);
  }
}

export type ListContentEditorActivityLogsInput = {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  segmentId?: string;
  targetLocale?: string;
  eventTypes?: readonly string[];
  actorKind?: ActivityActorKind;
  since?: string;
  cursor?: string;
  limit: number;
};

/**
 * Lists CAT activity for a project file or a single segment. Serves connected TMS projects,
 * whose encoded project IDs go-svc cannot resolve.
 */
export async function listContentEditorActivityLogs(
  input: ListContentEditorActivityLogsInput,
): Promise<
  | { ok: true; activityLogs: ContentEditorActivityLogItem[]; nextCursor: string | null }
  | { ok: false; error: "invalid_activity_log_cursor" }
> {
  const events = schema.organizationActivityEvents;
  const users = schema.users;
  const allowed = new Set<string>(CONTENT_EDITOR_ACTIVITY_EVENT_TYPES);
  const eventTypes = input.eventTypes?.length
    ? input.eventTypes.filter((type) => allowed.has(type))
    : [...CONTENT_EDITOR_ACTIVITY_EVENT_TYPES];

  const conditions: (SQL | undefined)[] = [
    eq(events.organizationId, input.organizationId),
    inArray(events.eventType, eventTypes as (typeof CONTENT_EDITOR_ACTIVITY_EVENT_TYPES)[number][]),
    sql`${events.payload}->>'projectId' = ${input.projectId}`,
  ];
  if (!isContentEditorAllFilesSourcePath(input.sourcePath)) {
    conditions.push(sql`${events.payload}->>'sourcePath' = ${input.sourcePath}`);
  }
  if (input.segmentId) {
    conditions.push(
      or(
        sql`${events.payload}->>'segmentId' = ${input.segmentId}`,
        sql`exists (
          select 1
          from jsonb_array_elements_text(coalesce(${events.payload}->'segmentIds', '[]'::jsonb)) as affected(segment_id)
          where affected.segment_id = ${input.segmentId}
        )`,
      ),
    );
  }
  if (input.targetLocale) {
    conditions.push(
      or(
        sql`${events.payload}->>'targetLocale' = ${input.targetLocale}`,
        isNull(sql`${events.payload}->>'targetLocale'`),
      ),
    );
  }
  if (input.actorKind) {
    conditions.push(eq(events.actorKind, input.actorKind));
  }
  if (input.since) {
    conditions.push(sql`${events.createdAt} >= ${input.since}::timestamptz`);
  }
  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    if (!cursor) {
      return { ok: false, error: "invalid_activity_log_cursor" };
    }
    conditions.push(
      sql`(${events.createdAt}, ${events.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      actorCredentialId: events.actorCredentialId,
      actorKind: events.actorKind,
      actorUserId: events.actorUserId,
      createdAt: events.createdAt,
      cursorCreatedAt: sql<string>`${events.createdAt}::text`,
      eventType: events.eventType,
      id: events.id,
      payload: events.payload,
      targetId: events.targetId,
      targetKind: events.targetKind,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(events)
    .leftJoin(users, eq(users.id, events.actorUserId))
    .where(and(...conditions))
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(input.limit + 1);

  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    ok: true,
    activityLogs: page.map((row) => ({
      actor: {
        credentialId: row.actorCredentialId,
        displayName: actorDisplayName(row.actorKind, row.firstName, row.lastName),
        kind: row.actorKind,
        userId: row.actorUserId,
      },
      createdAt: row.createdAt.toISOString(),
      eventType: row.eventType,
      id: row.id,
      payload: row.payload,
      target: {
        displayName: typeof row.payload.fileName === "string" ? row.payload.fileName : null,
        href: null,
        id: row.targetId,
        kind: row.targetKind,
      },
    })),
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor({ createdAt: last.cursorCreatedAt, id: last.id })
        : null,
  };
}
