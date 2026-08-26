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

import { db, schema, type DatabaseClient } from "@/lib/database";

export async function previewIdenticalStringGrouping(
  organizationId: string,
  projectId: string,
  database: DatabaseClient = db,
) {
  const duplicateGroups = database
    .select({
      occurrences: sql<number>`count(*)::int`.as("occurrences"),
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, organizationId),
        eq(schema.projectTranslationKeys.projectId, projectId),
      ),
    )
    .groupBy(schema.projectTranslationKeys.sourceText)
    .having(sql`count(*) > 1`)
    .as("duplicate_groups");

  const [preview] = await database
    .select({
      affectedOccurrences: sql<number>`coalesce(sum(${duplicateGroups.occurrences}), 0)::int`,
      groups: sql<number>`count(*)::int`,
    })
    .from(duplicateGroups);

  return preview ?? { affectedOccurrences: 0, groups: 0 };
}

export async function updateProjectCatGroupingPolicy(input: {
  organizationId: string;
  projectId: string;
  automaticallyGroupIdenticalStrings: boolean;
  actorUserId: string;
  database?: DatabaseClient;
}) {
  const database = input.database ?? db;
  const [project] = await database
    .update(schema.projects)
    .set({
      automaticallyGroupIdenticalStrings: input.automaticallyGroupIdenticalStrings,
      catGroupingRevision: sql`${schema.projects.catGroupingRevision} + 1`,
      updatedByUserId: input.actorUserId,
    })
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, input.projectId),
        sql`${schema.projects.automaticallyGroupIdenticalStrings} is distinct from ${input.automaticallyGroupIdenticalStrings}`,
      ),
    )
    .returning({
      automaticallyGroupIdenticalStrings: schema.projects.automaticallyGroupIdenticalStrings,
      groupingRevision: schema.projects.catGroupingRevision,
    });

  if (project) return project;

  const [unchanged] = await database
    .select({
      automaticallyGroupIdenticalStrings: schema.projects.automaticallyGroupIdenticalStrings,
      groupingRevision: schema.projects.catGroupingRevision,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, input.projectId),
      ),
    )
    .limit(1);

  return unchanged ?? null;
}
