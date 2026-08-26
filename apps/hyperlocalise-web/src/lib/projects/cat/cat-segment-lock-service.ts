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
import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";

export const maxCatSegmentLockBatch = 200;

export type CatSegmentLockResult = {
  updatedCount: number;
  isLocked: boolean;
};

function uniqueExternalStringIds(externalStringIds: string[]) {
  return [...new Set(externalStringIds.map((id) => id.trim()).filter((id) => id.length > 0))];
}

export async function listLockedCatSegmentIds(input: {
  organizationId: string;
  projectId: string;
  targetLocale: string;
  externalStringIds: string[];
}): Promise<Set<string>> {
  const externalStringIds = uniqueExternalStringIds(input.externalStringIds);
  const locked = new Set<string>();
  if (externalStringIds.length === 0) {
    return locked;
  }

  const rows = await db
    .select({
      externalStringId: schema.projectCatSegmentLocks.externalStringId,
    })
    .from(schema.projectCatSegmentLocks)
    .where(
      and(
        eq(schema.projectCatSegmentLocks.organizationId, input.organizationId),
        eq(schema.projectCatSegmentLocks.projectId, input.projectId),
        eq(schema.projectCatSegmentLocks.targetLocale, input.targetLocale),
        inArray(schema.projectCatSegmentLocks.externalStringId, externalStringIds),
      ),
    );

  for (const row of rows) {
    locked.add(row.externalStringId);
  }

  return locked;
}

export async function isCatSegmentLocked(input: {
  organizationId: string;
  projectId: string;
  targetLocale: string;
  externalStringId: string;
}): Promise<boolean> {
  const locked = await listLockedCatSegmentIds({
    ...input,
    externalStringIds: [input.externalStringId],
  });
  return locked.has(input.externalStringId);
}

export async function setCatSegmentLocks(input: {
  organizationId: string;
  projectId: string;
  targetLocale: string;
  externalStringIds: string[];
  isLocked: boolean;
  actorUserId?: string | null;
}): Promise<CatSegmentLockResult> {
  const externalStringIds = uniqueExternalStringIds(input.externalStringIds).slice(
    0,
    maxCatSegmentLockBatch,
  );
  if (externalStringIds.length === 0) {
    return { updatedCount: 0, isLocked: input.isLocked };
  }

  if (!input.isLocked) {
    const deleted = await db
      .delete(schema.projectCatSegmentLocks)
      .where(
        and(
          eq(schema.projectCatSegmentLocks.organizationId, input.organizationId),
          eq(schema.projectCatSegmentLocks.projectId, input.projectId),
          eq(schema.projectCatSegmentLocks.targetLocale, input.targetLocale),
          inArray(schema.projectCatSegmentLocks.externalStringId, externalStringIds),
        ),
      )
      .returning({
        externalStringId: schema.projectCatSegmentLocks.externalStringId,
      });

    return { updatedCount: deleted.length, isLocked: false };
  }

  const now = new Date();
  await db
    .insert(schema.projectCatSegmentLocks)
    .values(
      externalStringIds.map((externalStringId) => ({
        organizationId: input.organizationId,
        projectId: input.projectId,
        targetLocale: input.targetLocale,
        externalStringId,
        lockedByUserId: input.actorUserId ?? null,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [
        schema.projectCatSegmentLocks.organizationId,
        schema.projectCatSegmentLocks.projectId,
        schema.projectCatSegmentLocks.targetLocale,
        schema.projectCatSegmentLocks.externalStringId,
      ],
      set: {
        lockedByUserId: input.actorUserId ?? null,
        updatedAt: now,
      },
    });

  return { updatedCount: externalStringIds.length, isLocked: true };
}

export async function attachCatSegmentLocks<
  T extends {
    targetLocale: string;
    segments: Array<{ externalStringId: string; isLocked?: boolean }>;
  },
>(input: { organizationId: string; projectId: string; catQueue: T }): Promise<T> {
  const lockedIds = await listLockedCatSegmentIds({
    organizationId: input.organizationId,
    projectId: input.projectId,
    targetLocale: input.catQueue.targetLocale,
    externalStringIds: input.catQueue.segments.map((segment) => segment.externalStringId),
  });
  if (lockedIds.size === 0) {
    return input.catQueue;
  }

  return {
    ...input.catQueue,
    segments: input.catQueue.segments.map((segment) =>
      lockedIds.has(segment.externalStringId) ? { ...segment, isLocked: true } : segment,
    ),
  };
}
