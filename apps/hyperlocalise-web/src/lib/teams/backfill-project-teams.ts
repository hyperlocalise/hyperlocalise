import { isNull } from "drizzle-orm";

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
    .select({ count: schema.projects.id })
    .from(schema.projects)
    .where(isNull(schema.projects.teamId))
    .limit(1);

  return row ? 1 : 0;
}
