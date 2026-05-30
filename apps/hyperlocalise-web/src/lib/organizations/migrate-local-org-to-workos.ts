import { and, eq, inArray, like } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/database";
import { schema } from "@/lib/database";
import { isDeprecatedLocalOrgWorkosId } from "@/lib/billing/autumn-customer";
import { createLogger } from "@/lib/log";
import {
  isInvitedPlaceholderWorkosUserId,
  isReplacingWorkosMembership,
} from "@/lib/workos/constants";
import { provisionWorkspaceInWorkos } from "@/lib/workos/provision-workspace-in-workos";
import { serializeWorkosErrorForLog } from "@/lib/workos/serialize-workos-error-for-log";
import { getWorkosServerClient } from "@/lib/workos/server-client";
import { env } from "@/lib/env";
import type { OrganizationMembershipRole } from "@/lib/database/types";

const logger = createLogger("migrate-local-org-to-workos");

const LOCAL_ORG_WORKOS_ID_PATTERN = "local_org_%";

export type LocalOrgWorkspaceSummary = {
  organizationId: string;
  name: string;
  slug: string | null;
  lifecycleStatus: "active" | "archived" | "deprecated";
};

export async function listLocalOrgWorkspacesForUser(
  database: DatabaseClient,
  workosUserId: string,
): Promise<LocalOrgWorkspaceSummary[]> {
  if (isInvitedPlaceholderWorkosUserId(workosUserId)) {
    return [];
  }

  return database
    .select({
      organizationId: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      lifecycleStatus: schema.organizations.lifecycleStatus,
    })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.users.workosUserId, workosUserId),
        like(schema.organizations.workosOrganizationId, LOCAL_ORG_WORKOS_ID_PATTERN),
        inArray(schema.organizations.lifecycleStatus, ["active", "deprecated"]),
      ),
    )
    .orderBy(schema.organizations.name);
}

export type MigrateLocalOrgWorkspaceResult =
  | { status: "skipped"; reason: "not_local_org" | "workos_disabled" | "no_members" }
  | { status: "migrated"; workosOrganizationId: string; membershipsUpdated: number }
  | { status: "failed"; organizationId: string };

function isWorkosMigrationApiEnabled() {
  if (env.WORKOS_API_KEY === "test-workos-api-key") {
    return false;
  }

  return getWorkosServerClient() !== null;
}

function workosRoleSlugForMembershipRole(role: OrganizationMembershipRole) {
  if (role === "owner" || role === "admin") {
    return role;
  }

  return "member";
}

export async function migrateLocalOrgWorkspaceToWorkos(
  database: DatabaseClient,
  organizationId: string,
  actingWorkosUserId: string,
): Promise<MigrateLocalOrgWorkspaceResult> {
  if (!isWorkosMigrationApiEnabled()) {
    return { status: "skipped", reason: "workos_disabled" };
  }

  const [organization] = await database
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      workosOrganizationId: schema.organizations.workosOrganizationId,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  if (!organization || !isDeprecatedLocalOrgWorkosId(organization.workosOrganizationId)) {
    return { status: "skipped", reason: "not_local_org" };
  }

  const localMembers = await database
    .select({
      membershipId: schema.organizationMemberships.id,
      role: schema.organizationMemberships.role,
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
      workosUserId: schema.users.workosUserId,
    })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .where(eq(schema.organizationMemberships.organizationId, organizationId));

  const eligibleMembers = localMembers.filter(
    (member) =>
      !isInvitedPlaceholderWorkosUserId(member.workosUserId) &&
      !isReplacingWorkosMembership(member.workosMembershipId),
  );

  const actingMember = eligibleMembers.find((member) => member.workosUserId === actingWorkosUserId);

  if (!actingMember) {
    logger.warn("local_org_workspace_migration_skipped", {
      organizationId,
      reason: "acting_user_not_eligible",
      localMemberCount: localMembers.length,
      eligibleMemberCount: eligibleMembers.length,
    });

    return { status: "skipped", reason: "no_members" };
  }

  const provisionMembers = [
    {
      workosUserId: actingMember.workosUserId,
      role: actingMember.role,
    },
  ];
  const deferredMemberCount = eligibleMembers.length - provisionMembers.length;

  try {
    const provisioned = await provisionWorkspaceInWorkos({
      localWorkspaceId: organization.id,
      organizationName: organization.name,
      members: provisionMembers,
    });

    const membershipByUserId = new Map(
      provisioned.members.map((member) => [member.workosUserId, member]),
    );

    await database.transaction(async (tx) => {
      await tx
        .update(schema.organizations)
        .set({
          workosOrganizationId: provisioned.workosOrganizationId,
          lifecycleStatus: "active",
          updatedAt: new Date(),
        })
        .where(eq(schema.organizations.id, organizationId));

      for (const member of localMembers) {
        const remote = membershipByUserId.get(member.workosUserId);
        if (!remote) {
          continue;
        }

        await tx
          .update(schema.organizationMemberships)
          .set({
            workosMembershipId: remote.workosMembershipId,
            role: remote.role,
            updatedAt: new Date(),
          })
          .where(eq(schema.organizationMemberships.id, member.membershipId));
      }
    });

    return {
      status: "migrated",
      workosOrganizationId: provisioned.workosOrganizationId,
      membershipsUpdated: provisioned.members.length,
    };
  } catch (error) {
    logger.warn("local_org_workspace_migration_failed", {
      organizationId,
      actingWorkosUserId,
      localMemberCount: localMembers.length,
      eligibleMemberCount: eligibleMembers.length,
      deferredMemberCount,
      roleSlug: workosRoleSlugForMembershipRole(actingMember.role),
      ...serializeWorkosErrorForLog(error),
    });

    return { status: "failed", organizationId };
  }
}

/**
 * Promotes legacy `local_org_*` workspaces for a signed-in user before membership reconcile.
 * Safe to call on every session; skips organizations that are already on real WorkOS ids.
 */
export async function migrateLocalOrgWorkspacesForUser(
  database: DatabaseClient,
  workosUserId: string,
): Promise<{ migrated: number; failed: number; skipped: number }> {
  if (isInvitedPlaceholderWorkosUserId(workosUserId) || !isWorkosMigrationApiEnabled()) {
    return { migrated: 0, failed: 0, skipped: 0 };
  }

  const organizations = await listLocalOrgWorkspacesForUser(database, workosUserId);

  let migrated = 0;
  let failed = 0;
  let skipped = 0;

  for (const { organizationId } of organizations) {
    const result = await migrateLocalOrgWorkspaceToWorkos(database, organizationId, workosUserId);
    if (result.status === "migrated") {
      migrated += 1;
      continue;
    }

    if (result.status === "failed") {
      failed += 1;
      continue;
    }

    skipped += 1;
  }

  return { migrated, failed, skipped };
}
