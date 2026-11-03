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
import { and, eq, sql } from "drizzle-orm";

import { schema, type DatabaseClient } from "@/lib/database/client";

/**
 * Hides the keys of a source file that a repository sync no longer finds, and marks them as
 * hidden by a sync so only a sync unhides them. Keys someone hid by hand are left alone.
 * With `keepVersionId`, keys written by that version are the ones still present.
 * Returns the keys hidden by this call, sorted.
 */
export async function hideKeysMissingFromSync(
  database: DatabaseClient,
  input: {
    organizationId: string;
    projectId: string;
    repositorySourceFileId: string;
    keepVersionId?: string;
  },
): Promise<string[]> {
  const hidden = await database
    .update(schema.projectTranslationKeys)
    .set({ isHidden: true, hiddenBySyncAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.repositorySourceFileId, input.repositorySourceFileId),
        eq(schema.projectTranslationKeys.isHidden, false),
        input.keepVersionId
          ? sql`${schema.projectTranslationKeys.sourceFileVersionId} IS DISTINCT FROM ${input.keepVersionId}::uuid`
          : undefined,
      ),
    )
    .returning({ key: schema.projectTranslationKeys.key });
  return hidden.map((row) => row.key).sort();
}

/** Shows the keys a sync hid again, for a version the repository has back. */
export async function unhideKeysSyncHid(
  database: DatabaseClient,
  input: { repositorySourceFileId: string; sourceFileVersionId: string },
): Promise<void> {
  await database
    .update(schema.projectTranslationKeys)
    .set({ isHidden: false, hiddenBySyncAt: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.projectTranslationKeys.repositorySourceFileId, input.repositorySourceFileId),
        eq(schema.projectTranslationKeys.sourceFileVersionId, input.sourceFileVersionId),
        sql`${schema.projectTranslationKeys.hiddenBySyncAt} IS NOT NULL`,
      ),
    );
}
