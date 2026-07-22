/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { isNull, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import { backfillOrganizationProjectTeams } from "./default-workspace-team";

export async function backfillAllOrganizationProjectTeams() {
  const organizations = await db.select({ id: schema.organizations.id }).from(schema.organizations);

  for (const organization of organizations) {
    await backfillOrganizationProjectTeams(organization.id);
  }
}

export async function countProjectsMissingTeam() {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.projects)
    .where(isNull(schema.projects.teamId));

  return row?.count ?? 0;
}
