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
import type { DatabaseClient } from "@/lib/database/client";
import { schema } from "@/lib/database/client";
import type { GlossaryHistoryChange } from "@/lib/database/schema/glossary-history";

export type GlossaryHistoryActor = {
  kind?: string;
  userId?: string | null;
  credentialId?: string | null;
};

export type GlossaryHistoryTarget = {
  conceptId?: string | null;
  termId?: string | null;
  resourceKind: "glossary" | "project" | "concept" | "term";
};

type HistoryValue = Record<string, unknown>;

export function diffGlossaryFields(
  before: HistoryValue | null,
  after: HistoryValue | null,
  fields: readonly string[],
): GlossaryHistoryChange[] {
  return fields.flatMap((field) => {
    const beforeValue = before?.[field] ?? null;
    const afterValue = after?.[field] ?? null;
    return Object.is(beforeValue, afterValue) ||
      JSON.stringify(beforeValue) === JSON.stringify(afterValue)
      ? []
      : [{ field, before: beforeValue, after: afterValue }];
  });
}

export async function appendGlossaryHistoryEvent(
  database: DatabaseClient,
  input: {
    organizationId: string;
    glossaryId: string;
    target: GlossaryHistoryTarget;
    eventType: string;
    actor?: GlossaryHistoryActor;
    version?: number;
    reason?: string | null;
    changes?: GlossaryHistoryChange[];
    attributes?: HistoryValue;
  },
) {
  const changes = input.changes ?? [];
  if (input.eventType === "updated" && changes.length === 0) return null;

  const [event] = await database
    .insert(schema.glossaryHistoryEvents)
    .values({
      organizationId: input.organizationId,
      glossaryId: input.glossaryId,
      conceptId: input.target.conceptId ?? null,
      termId: input.target.termId ?? null,
      eventType: input.eventType,
      actorKind: input.actor?.kind ?? "user",
      actorUserId: input.actor?.userId ?? null,
      actorCredentialId: input.actor?.credentialId ?? null,
      version: input.version ?? 1,
      reason: input.reason ?? null,
      changedFields: changes.map((change) => change.field),
      changes,
      attributes: {
        resourceKind: input.target.resourceKind,
        ...input.attributes,
      },
    })
    .returning();

  return event ?? null;
}

export function historyActorFromUser(userId: string | null | undefined): GlossaryHistoryActor {
  return { kind: "user", userId: userId ?? null, credentialId: null };
}
