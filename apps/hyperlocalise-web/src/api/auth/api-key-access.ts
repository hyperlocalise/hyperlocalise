import { and, eq } from "drizzle-orm";

import { enrichAuthContextWithCapabilities } from "@/api/auth/policy";
import { ownedProjectWhere } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { resolveOrganizationMembershipAccessSource } from "@/lib/workos/membership-access";

export async function resolveApiKeyTeamAccessContext(input: {
  organizationId: string;
  createdByUserId: string | null;
}): Promise<ApiAuthContext | null> {
  if (!input.createdByUserId) {
    return null;
  }

  const [membership] = await db
    .select({
      workosUserId: schema.users.workosUserId,
      localUserId: schema.users.id,
      email: schema.users.email,
      workosOrganizationId: schema.organizations.workosOrganizationId,
      localOrganizationId: schema.organizations.id,
      organizationName: schema.organizations.name,
      organizationSlug: schema.organizations.slug,
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
      role: schema.organizationMemberships.role,
    })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.organizationMemberships.userId, input.createdByUserId),
        eq(schema.organizationMemberships.organizationId, input.organizationId),
        eq(schema.organizations.lifecycleStatus, "active"),
      ),
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  const organization = {
    workosOrganizationId: membership.workosOrganizationId,
    localOrganizationId: membership.localOrganizationId,
    name: membership.organizationName,
    slug: membership.organizationSlug,
    membership: {
      workosMembershipId: membership.workosMembershipId,
      role: membership.role,
      accessSource: resolveOrganizationMembershipAccessSource(membership.workosMembershipId),
    },
  };

  const authBase = {
    user: {
      workosUserId: membership.workosUserId,
      localUserId: membership.localUserId,
      email: membership.email,
    },
    organizations: [organization],
    organization,
    activeOrganization: organization,
    membership: organization.membership,
    activeTeam: null,
  };

  return enrichAuthContextWithCapabilities(authBase);
}

export async function getAccessibleProjectForApiKey(teamAccess: ApiAuthContext, projectId: string) {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(await ownedProjectWhere(teamAccess, projectId))
    .limit(1);

  return project ?? null;
}
