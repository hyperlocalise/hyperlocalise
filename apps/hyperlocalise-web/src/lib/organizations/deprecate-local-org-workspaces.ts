import { and, eq, like, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

const LOCAL_ORG_WORKOS_ID_PREFIX = "local_org_%";

/**
 * Marks legacy organizations with synthetic WorkOS ids as deprecated.
 * Run once after migration 0022 via `vp run db:deprecate-local-org-workspaces`.
 */
export async function deprecateLocalOrgWorkspaces() {
  const deprecatedAt = new Date();

  const updated = await db
    .update(schema.organizations)
    .set({
      lifecycleStatus: "deprecated",
      archivedAt: deprecatedAt,
      updatedAt: deprecatedAt,
    })
    .where(like(schema.organizations.workosOrganizationId, LOCAL_ORG_WORKOS_ID_PREFIX))
    .returning({ id: schema.organizations.id });

  return updated.length;
}

export async function countActiveLocalOrgWorkspaces() {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.organizations)
    .where(
      and(
        like(schema.organizations.workosOrganizationId, LOCAL_ORG_WORKOS_ID_PREFIX),
        eq(schema.organizations.lifecycleStatus, "active"),
      ),
    );

  return row?.count ?? 0;
}
