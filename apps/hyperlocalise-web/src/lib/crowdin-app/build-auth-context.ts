import { and, eq, isNotNull, ne } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { enrichAuthContextWithCapabilities } from "@/api/auth/policy";
import {
  assertWorkosMembershipReconcileAllowsAccess,
  reconcileWorkosMembershipsForUser,
} from "@/api/auth/workos-membership-reconcile";
import { db, schema } from "@/lib/database";
import { REPLACING_WORKOS_MEMBERSHIP_ID } from "@/lib/workos/constants";
import { resolveOrganizationMembershipAccessSource } from "@/lib/workos/membership-access";
import type { CrowdinEmbedSessionPayload } from "@/lib/crowdin-app/embed-session";

export async function resolveApiAuthContextFromCrowdinEmbed(
  session: CrowdinEmbedSessionPayload,
): Promise<ApiAuthContext | null> {
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      workosUserId: schema.users.workosUserId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.hlUserId))
    .limit(1);

  if (!user?.workosUserId) {
    return null;
  }

  const reconcileResult = await reconcileWorkosMembershipsForUser(db, {
    workosUserId: user.workosUserId,
    email: user.email,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    avatarUrl: user.avatarUrl ?? undefined,
    workosOrganizationId: undefined,
    force: false,
  });

  await assertWorkosMembershipReconcileAllowsAccess(db, user.workosUserId, reconcileResult);

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
        eq(schema.users.id, session.hlUserId),
        eq(schema.organizations.id, session.hlOrganizationId),
        eq(schema.organizations.lifecycleStatus, "active"),
        isNotNull(schema.organizationMemberships.workosMembershipId),
        ne(schema.organizationMemberships.workosMembershipId, REPLACING_WORKOS_MEMBERSHIP_ID),
      ),
    )
    .limit(1);

  if (!membership || !membership.organizationSlug) {
    return null;
  }

  if (membership.organizationSlug !== session.hlOrganizationSlug) {
    return null;
  }

  const accessSource = resolveOrganizationMembershipAccessSource(membership.workosMembershipId);
  if (accessSource !== "workos_authoritative") {
    return null;
  }

  const activeOrganization = {
    workosOrganizationId: membership.workosOrganizationId,
    localOrganizationId: membership.localOrganizationId,
    name: membership.organizationName,
    slug: membership.organizationSlug,
    membership: {
      workosMembershipId: membership.workosMembershipId,
      role: membership.role,
      accessSource,
    },
  };

  return enrichAuthContextWithCapabilities({
    user: {
      workosUserId: membership.workosUserId,
      localUserId: membership.localUserId,
      email: membership.email,
    },
    organizations: [activeOrganization],
    organization: activeOrganization,
    activeOrganization,
    membership: {
      workosMembershipId: activeOrganization.membership.workosMembershipId,
      role: activeOrganization.membership.role,
      accessSource: activeOrganization.membership.accessSource,
    },
    activeTeam: null,
  });
}
