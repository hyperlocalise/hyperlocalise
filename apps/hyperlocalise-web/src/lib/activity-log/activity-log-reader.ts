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
import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { V1_ACTIVITY_EVENT_TYPES, type V1ActivityEventType } from "./activity-log-contract";

export const ACTIVITY_LOG_RANGES = ["24h", "7d", "30d", "all"] as const;
export type ActivityLogRange = (typeof ACTIVITY_LOG_RANGES)[number];

export type ActivityLogActorFilter =
  | "system"
  | "agent"
  | "api_key"
  | { kind: "user"; userId: string };

export type ActivityLogQuery = {
  actor?: ActivityLogActorFilter;
  cursor?: string;
  eventTypes: V1ActivityEventType[];
  limit: number;
  range: ActivityLogRange;
};

export type ActivityLogActorView = {
  credentialId: string | null;
  displayName: string;
  kind: string;
  userId: string | null;
};

export type ActivityLogTargetView = {
  displayName: string | null;
  href: string | null;
  id: string;
  kind: string;
};

export type ActivityLogListItem = {
  actor: ActivityLogActorView;
  createdAt: string;
  eventType: V1ActivityEventType;
  id: string;
  payload: Record<string, unknown>;
  target: ActivityLogTargetView;
};

export type ActivityLogListResult = {
  activityLogs: ActivityLogListItem[];
  nextCursor: string | null;
};

export class InvalidActivityLogCursorError extends Error {
  constructor() {
    super("invalid_activity_log_cursor");
  }
}

function filterFingerprint(query: ActivityLogQuery): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actor: query.actor ?? null,
        eventTypes: [...query.eventTypes].sort(),
        range: query.range,
      }),
    )
    .digest("hex");
}

function encodeCursor(cursor: { createdAt: Date; id: string }, fingerprint: string): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      filterFingerprint: fingerprint,
      id: cursor.id,
    }),
  ).toString("base64url");
}

function decodeCursor(cursor: string, fingerprint: string): { createdAt: Date; id: string } {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      filterFingerprint?: unknown;
      id?: unknown;
    };
    const createdAt = typeof decoded.createdAt === "string" ? new Date(decoded.createdAt) : null;

    if (
      !createdAt ||
      Number.isNaN(createdAt.getTime()) ||
      typeof decoded.id !== "string" ||
      !decoded.id ||
      decoded.filterFingerprint !== fingerprint
    ) {
      throw new InvalidActivityLogCursorError();
    }

    return { createdAt, id: decoded.id };
  } catch (error) {
    if (error instanceof InvalidActivityLogCursorError) throw error;
    throw new InvalidActivityLogCursorError();
  }
}

function buildRangeCondition(range: ActivityLogRange) {
  switch (range) {
    case "24h":
      return gt(
        schema.organizationActivityEvents.createdAt,
        sql`clock_timestamp() - interval '24 hours'`,
      );
    case "7d":
      return gt(
        schema.organizationActivityEvents.createdAt,
        sql`clock_timestamp() - interval '7 days'`,
      );
    case "30d":
      return gt(
        schema.organizationActivityEvents.createdAt,
        sql`clock_timestamp() - interval '30 days'`,
      );
    case "all":
      return undefined;
  }
}

function targetKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function actorName(firstName: string | null, lastName: string | null): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || "Deleted user";
}

async function loadTargetViews(
  database: DatabaseClient,
  organizationId: string,
  organizationSlug: string,
  rows: Array<{ targetId: string; targetKind: string; payload: Record<string, unknown> }>,
): Promise<Map<string, ActivityLogTargetView>> {
  const idsByKind = new Map<string, string[]>();
  for (const row of rows) {
    const ids = idsByKind.get(row.targetKind) ?? [];
    ids.push(row.targetId);
    idsByKind.set(row.targetKind, ids);
  }

  const projectIds = idsByKind.get("project") ?? [];
  const glossaryIds = idsByKind.get("glossary") ?? [];
  const memoryIds = idsByKind.get("translation_memory") ?? [];
  const membershipIds = idsByKind.get("membership") ?? [];

  const [projects, glossaries, memories, memberships] = await Promise.all([
    projectIds.length
      ? database
          .select({ id: schema.projects.id, name: schema.projects.name })
          .from(schema.projects)
          .where(
            and(
              eq(schema.projects.organizationId, organizationId),
              inArray(schema.projects.id, projectIds),
            ),
          )
      : Promise.resolve([]),
    glossaryIds.length
      ? database
          .select({ id: schema.glossaries.id, name: schema.glossaries.name })
          .from(schema.glossaries)
          .where(
            and(
              eq(schema.glossaries.organizationId, organizationId),
              inArray(schema.glossaries.id, glossaryIds),
            ),
          )
      : Promise.resolve([]),
    memoryIds.length
      ? database
          .select({ id: schema.memories.id, name: schema.memories.name })
          .from(schema.memories)
          .where(
            and(
              eq(schema.memories.organizationId, organizationId),
              inArray(schema.memories.id, memoryIds),
            ),
          )
      : Promise.resolve([]),
    membershipIds.length
      ? database
          .select({
            id: schema.organizationMemberships.id,
            firstName: schema.users.firstName,
            lastName: schema.users.lastName,
          })
          .from(schema.organizationMemberships)
          .leftJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
          .where(
            and(
              eq(schema.organizationMemberships.organizationId, organizationId),
              inArray(schema.organizationMemberships.id, membershipIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const views = new Map<string, ActivityLogTargetView>();
  for (const project of projects) {
    views.set(targetKey("project", project.id), {
      displayName: project.name,
      href: `/org/${organizationSlug}/projects/${project.id}`,
      id: project.id,
      kind: "project",
    });
  }
  for (const glossary of glossaries) {
    views.set(targetKey("glossary", glossary.id), {
      displayName: glossary.name,
      href: `/org/${organizationSlug}/glossaries/${glossary.id}`,
      id: glossary.id,
      kind: "glossary",
    });
  }
  for (const memory of memories) {
    views.set(targetKey("translation_memory", memory.id), {
      displayName: memory.name,
      href: `/org/${organizationSlug}/translation-memories/${memory.id}`,
      id: memory.id,
      kind: "translation_memory",
    });
  }
  for (const membership of memberships) {
    views.set(targetKey("membership", membership.id), {
      displayName: actorName(membership.firstName, membership.lastName),
      href: `/org/${organizationSlug}/settings/members`,
      id: membership.id,
      kind: "membership",
    });
  }

  for (const row of rows) {
    const key = targetKey(row.targetKind, row.targetId);
    if (views.has(key)) continue;
    const payloadName = typeof row.payload.name === "string" ? row.payload.name : null;
    views.set(key, {
      displayName: payloadName,
      href: null,
      id: row.targetId,
      kind: row.targetKind,
    });
  }

  return views;
}

export async function listActivityLogEvents(input: {
  database?: DatabaseClient;
  organizationId: string;
  organizationSlug: string;
  query: ActivityLogQuery;
}): Promise<ActivityLogListResult> {
  const database = input.database ?? db;
  const fingerprint = filterFingerprint(input.query);
  const cursor = input.query.cursor ? decodeCursor(input.query.cursor, fingerprint) : undefined;
  const conditions = [eq(schema.organizationActivityEvents.organizationId, input.organizationId)];
  const rangeCondition = buildRangeCondition(input.query.range);
  if (rangeCondition) conditions.push(rangeCondition);
  conditions.push(
    inArray(
      schema.organizationActivityEvents.eventType,
      input.query.eventTypes.length ? input.query.eventTypes : V1_ACTIVITY_EVENT_TYPES,
    ),
  );
  if (input.query.actor) {
    if (typeof input.query.actor === "string") {
      conditions.push(eq(schema.organizationActivityEvents.actorKind, input.query.actor));
    } else {
      conditions.push(
        and(
          eq(schema.organizationActivityEvents.actorKind, "user"),
          eq(schema.organizationActivityEvents.actorUserId, input.query.actor.userId),
        )!,
      );
    }
  }
  if (cursor) {
    conditions.push(
      or(
        lt(schema.organizationActivityEvents.createdAt, cursor.createdAt),
        and(
          eq(schema.organizationActivityEvents.createdAt, cursor.createdAt),
          lt(schema.organizationActivityEvents.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await database
    .select({
      actorCredentialId: schema.organizationActivityEvents.actorCredentialId,
      actorKind: schema.organizationActivityEvents.actorKind,
      actorUserId: schema.organizationActivityEvents.actorUserId,
      createdAt: schema.organizationActivityEvents.createdAt,
      eventType: schema.organizationActivityEvents.eventType,
      id: schema.organizationActivityEvents.id,
      payload: schema.organizationActivityEvents.payload,
      targetId: schema.organizationActivityEvents.targetId,
      targetKind: schema.organizationActivityEvents.targetKind,
      userFirstName: schema.users.firstName,
      userLastName: schema.users.lastName,
    })
    .from(schema.organizationActivityEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.organizationActivityEvents.actorUserId))
    .where(and(...conditions))
    .orderBy(
      desc(schema.organizationActivityEvents.createdAt),
      desc(schema.organizationActivityEvents.id),
    )
    .limit(input.query.limit + 1);

  const hasNextPage = rows.length > input.query.limit;
  const page = hasNextPage ? rows.slice(0, input.query.limit) : rows;
  const targets = await loadTargetViews(
    database,
    input.organizationId,
    input.organizationSlug,
    page,
  );

  const activityLogs = page.map((row) => ({
    actor: {
      credentialId: row.actorCredentialId,
      displayName:
        row.actorKind === "system"
          ? "System"
          : row.actorKind === "agent"
            ? "Agent"
            : row.actorKind === "api_key"
              ? "API credential"
              : actorName(row.userFirstName, row.userLastName),
      kind: row.actorKind,
      userId: row.actorUserId,
    },
    createdAt: row.createdAt.toISOString(),
    eventType: row.eventType as V1ActivityEventType,
    id: row.id,
    payload: row.payload,
    target: targets.get(targetKey(row.targetKind, row.targetId))!,
  }));

  const last = page.at(-1);
  return {
    activityLogs,
    nextCursor: hasNextPage && last ? encodeCursor(last, fingerprint) : null,
  };
}
