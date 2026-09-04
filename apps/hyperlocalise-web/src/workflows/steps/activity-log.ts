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
import type { ActivityLogWorkflowEvent } from "@/lib/activity-log/activity-log-contract";

export async function persistActivityLogStep(event: ActivityLogWorkflowEvent): Promise<void> {
  "use step";

  const { db, schema } = await import("@/lib/database/client");

  const createdAt = new Date(event.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("activity_log_invalid_created_at");
  }

  await db
    .insert(schema.organizationActivityEvents)
    .values({
      actorCredentialId: event.actorCredentialId,
      actorKind: event.actorKind,
      actorUserId: event.actorUserId,
      createdAt,
      eventType: event.eventType,
      id: event.id,
      organizationId: event.organizationId,
      payload: event.payload,
      targetId: event.targetId,
      targetKind: event.targetKind,
    })
    .onConflictDoNothing({ target: schema.organizationActivityEvents.id });
}
