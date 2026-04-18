import { and, eq } from "drizzle-orm";
import { withAuth } from "@workos-inc/authkit-nextjs";

import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

export async function resolveApiAuthContextFromSession(): Promise<ApiAuthContext | null> {
  const session = await withAuth();

  if (!session.user || !session.organizationId) {
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
        eq(schema.users.workosUserId, session.user.id),
        eq(schema.organizations.workosOrganizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  return {
    user: {
      workosUserId: membership.workosUserId,
      localUserId: membership.localUserId,
      email: membership.email,
    },
    organization: {
      workosOrganizationId: membership.workosOrganizationId,
      localOrganizationId: membership.localOrganizationId,
      name: membership.organizationName,
      slug: membership.organizationSlug,
    },
    membership: {
      workosMembershipId: membership.workosMembershipId,
      role: membership.role,
    },
  };
}
