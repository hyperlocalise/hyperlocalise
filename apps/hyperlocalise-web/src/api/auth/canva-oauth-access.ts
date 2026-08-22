import { and, eq, isNotNull, ne } from "drizzle-orm";

import { enrichAuthContextWithCapabilities } from "@/api/auth/policy";
import type { ApiAuthContext } from "@/api/auth/workos";
import type { CanvaOAuthSessionAuth } from "@/api/auth/canva-oauth";
import { db, schema } from "@/lib/database";
import { resolveOrganizationMembershipAccessSource } from "@/lib/workos/membership-access";
import { REPLACING_WORKOS_MEMBERSHIP_ID } from "@/lib/workos/constants";

export async function buildApiAuthContextForCanvaUser(input: {
  session: CanvaOAuthSessionAuth;
  organizationId: string;
}): Promise<ApiAuthContext | null> {
  const [organization] = await db
    .select({
      id: schema.organizations.id,
      workosOrganizationId: schema.organizations.workosOrganizationId,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, input.organizationId))
    .limit(1);

  if (!organization) {
    return null;
  }

  const [membership] = await db
    .select({
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
      role: schema.organizationMemberships.role,
    })
    .from(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.userId, input.session.user.localUserId),
        eq(schema.organizationMemberships.organizationId, organization.id),
        isNotNull(schema.organizationMemberships.workosMembershipId),
        ne(schema.organizationMemberships.workosMembershipId, REPLACING_WORKOS_MEMBERSHIP_ID),
      ),
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  const organizationIdentity = {
    workosOrganizationId: organization.workosOrganizationId,
    localOrganizationId: organization.id,
    name: organization.name,
    slug: organization.slug,
    membership: {
      workosMembershipId: membership.workosMembershipId,
      role: membership.role,
      accessSource: resolveOrganizationMembershipAccessSource(membership.workosMembershipId),
    },
  };

  return enrichAuthContextWithCapabilities({
    user: {
      workosUserId: input.session.user.workosUserId,
      localUserId: input.session.user.localUserId,
      email: input.session.user.email,
    },
    organizations: [organizationIdentity],
    organization: organizationIdentity,
    activeOrganization: organizationIdentity,
    membership: organizationIdentity.membership,
    activeTeam: null,
  });
}
