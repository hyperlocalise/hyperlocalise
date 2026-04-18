import { eq } from "drizzle-orm";
import { withAuth } from "@workos-inc/authkit-nextjs";

import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

type ResolveApiAuthContextOptions = {
  organizationSlug?: string;
  session?: Awaited<ReturnType<typeof withAuth>>;
};

type OrganizationMembershipRecord = {
  workosUserId: string;
  localUserId: string;
  email: string;
  workosOrganizationId: string;
  localOrganizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  workosMembershipId: string | null;
  role: ApiAuthContext["membership"]["role"];
};

function selectActiveOrganization(
  organizations: ApiAuthContext["organizations"],
  options: {
    organizationSlug?: string;
    workosOrganizationId?: string | null;
  },
) {
  if (options.organizationSlug) {
    const organization = organizations.find((item) => item.slug === options.organizationSlug);

    if (!organization) {
      throw new Error("organization_access_denied");
    }

    return organization;
  }

  if (options.workosOrganizationId) {
    const organization = organizations.find(
      (item) => item.workosOrganizationId === options.workosOrganizationId,
    );

    if (organization) {
      return organization;
    }
  }

  return organizations[0] ?? null;
}

export async function resolveApiAuthContextFromSession(
  options: ResolveApiAuthContextOptions = {},
): Promise<ApiAuthContext | null> {
  const session = options.session ?? (await withAuth());

  if (!session.user) {
    return null;
  }

  const memberships = await db
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
    .where(eq(schema.users.workosUserId, session.user.id))
    .orderBy(schema.organizations.name);

  if (memberships.length === 0) {
    return null;
  }

  const organizations = memberships.map((membership: OrganizationMembershipRecord) => ({
    workosOrganizationId: membership.workosOrganizationId,
    localOrganizationId: membership.localOrganizationId,
    name: membership.organizationName,
    slug: membership.organizationSlug,
    membership: {
      workosMembershipId: membership.workosMembershipId,
      role: membership.role,
    },
  }));

  const activeOrganization = selectActiveOrganization(organizations, {
    organizationSlug: options.organizationSlug,
    workosOrganizationId: session.organizationId,
  });

  if (!activeOrganization) {
    return null;
  }

  const membership = memberships.find(
    (item) => item.localOrganizationId === activeOrganization.localOrganizationId,
  );

  if (!membership) {
    return null;
  }

  return {
    user: {
      workosUserId: membership.workosUserId,
      localUserId: membership.localUserId,
      email: membership.email,
    },
    organizations,
    organization: activeOrganization,
    activeOrganization,
    membership: {
      workosMembershipId: activeOrganization.membership.workosMembershipId,
      role: activeOrganization.membership.role,
    },
    activeTeam: null,
  };
}
