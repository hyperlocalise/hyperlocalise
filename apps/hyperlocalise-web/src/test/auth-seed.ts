import { randomUUID } from "node:crypto";

import type { ApiAuthContext, WorkosAuthIdentity } from "@/api/auth/workos";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { enrichAuthContextWithCapabilities } from "@/api/auth/policy";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db } from "@/lib/database";
import { resolveOrganizationMembershipAccessSource } from "@/lib/workos/membership-access";

export function withMembershipAccessSource<
  T extends { workosMembershipId: string | null; role: OrganizationMembershipRole },
>(membership: T) {
  return {
    ...membership,
    accessSource: resolveOrganizationMembershipAccessSource(membership.workosMembershipId),
  };
}

export function createWorkosIdentityWithRole(
  role: WorkosAuthIdentity["membership"]["role"],
): WorkosAuthIdentity {
  const suffix = randomUUID();

  return {
    user: {
      workosUserId: `user_${suffix}`,
      email: `${suffix}@example.com`,
    },
    organization: {
      workosOrganizationId: `org_${suffix}`,
      name: `Example Org ${suffix}`,
      slug: `example-org-${suffix}`,
    },
    membership: {
      workosMembershipId: `membership_${suffix}`,
      role,
    },
  };
}

export function createWorkosIdentity(): WorkosAuthIdentity {
  return createWorkosIdentityWithRole("admin");
}

export function toAuthOrganization(
  organization: Awaited<ReturnType<typeof syncWorkosIdentity>>["organization"],
  membership: Awaited<ReturnType<typeof syncWorkosIdentity>>["membership"],
) {
  return {
    workosOrganizationId: organization.workosOrganizationId,
    localOrganizationId: organization.id,
    name: organization.name,
    slug: organization.slug,
    membership: withMembershipAccessSource({
      workosMembershipId: membership.workosMembershipId,
      role: membership.role,
    }),
  };
}

export async function syncWorkosIdentityToAuthContext(identity: WorkosAuthIdentity) {
  const { user, organization, membership } = await syncWorkosIdentity(db, identity);
  const activeOrganization = toAuthOrganization(organization, membership);

  const authContext = enrichAuthContextWithCapabilities({
    user: {
      workosUserId: user.workosUserId,
      localUserId: user.id,
      email: user.email,
    },
    organizations: [activeOrganization],
    organization: activeOrganization,
    activeOrganization,
    membership: withMembershipAccessSource({
      workosMembershipId: membership.workosMembershipId,
      role: membership.role,
    }),
    activeTeam: null,
  });

  return {
    authContext,
    identity,
    membership,
    organization,
    user,
  };
}

export function switchAuthContextOrganization(
  authContext: ApiAuthContext,
  organizationSlug: string | undefined,
) {
  if (!organizationSlug || authContext.organization.slug == null) {
    return authContext;
  }

  const activeOrganization = authContext.organizations.find(
    (organization) => organization.slug === organizationSlug,
  );

  if (!activeOrganization) {
    return authContext;
  }

  return enrichAuthContextWithCapabilities({
    ...authContext,
    organization: activeOrganization,
    activeOrganization,
    membership: withMembershipAccessSource({
      workosMembershipId: activeOrganization.membership.workosMembershipId ?? null,
      role: activeOrganization.membership.role,
    }),
  });
}
