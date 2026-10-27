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
import { eq, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";

/**
 * When Reports started recording for a workspace, set the first time it records anything for it.
 * A workspace that already has records (from before this was kept per workspace) starts at its
 * earliest one.
 */
export async function reportingStart(
  organizationId: string,
  database: DatabaseClient = db,
): Promise<Date> {
  const known = await getReportingStart(organizationId, database);
  if (known) return known;
  await database.execute(sql`
    insert into reporting_workspaces (organization_id, started_at)
    select ${organizationId}, coalesce(least(
      (select min(created_at) from reporting_analyses where organization_id = ${organizationId}),
      (select min(created_at) from reporting_activity where organization_id = ${organizationId}),
      (select min(created_at) from reporting_costs where organization_id = ${organizationId})
    ), now())
    on conflict (organization_id) do nothing
  `);
  return (await getReportingStart(organizationId, database))!;
}

/** When Reports started recording for a workspace, or null when it has recorded nothing. */
export async function getReportingStart(
  organizationId: string,
  database: DatabaseClient = db,
): Promise<Date | null> {
  const [workspace] = await database
    .select({ startedAt: schema.reportingWorkspaces.startedAt })
    .from(schema.reportingWorkspaces)
    .where(eq(schema.reportingWorkspaces.organizationId, organizationId));
  return workspace?.startedAt ?? null;
}
