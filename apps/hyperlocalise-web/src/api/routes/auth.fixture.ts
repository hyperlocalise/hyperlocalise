import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { ApiAuthContext, WorkosAuthIdentity } from "@/api/auth/workos";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database";
import { cleanupWorkosTestRecords } from "./test-cleanup";

declare global {
  var __testApiAuthContext: ApiAuthContext | undefined;
}

export function createAuthTestFixture() {
  const createdWorkosUserIds = new Set<string>();
  const createdWorkosOrganizationIds = new Set<string>();

  function createWorkosIdentityWithRole(
    role: WorkosAuthIdentity["membership"]["role"],
  ): WorkosAuthIdentity {
    const suffix = randomUUID();
    const workosUserId = `user_${suffix}`;
    const workosOrganizationId = `org_${suffix}`;

    createdWorkosUserIds.add(workosUserId);
    createdWorkosOrganizationIds.add(workosOrganizationId);

    return {
      user: {
        workosUserId,
        email: `${suffix}@example.com`,
      },
      organization: {
        workosOrganizationId,
        name: `Example Org ${suffix}`,
        slug: `example-org-${suffix}`,
      },
      membership: {
        workosMembershipId: `membership_${suffix}`,
        role,
      },
    };
  }

  function createWorkosIdentity(): WorkosAuthIdentity {
    return createWorkosIdentityWithRole("owner");
  }

  function createWorkosIdentityForOrganization(
    organization: WorkosAuthIdentity["organization"],
    role: WorkosAuthIdentity["membership"]["role"],
  ): WorkosAuthIdentity {
    const suffix = randomUUID();
    const workosUserId = `user_${suffix}`;

    createdWorkosUserIds.add(workosUserId);
    createdWorkosOrganizationIds.add(organization.workosOrganizationId);

    return {
      user: {
        workosUserId,
        email: `${suffix}@example.com`,
      },
      organization,
      membership: {
        workosMembershipId: `membership_${suffix}`,
        role,
      },
    };
  }

  async function authHeadersFor(identity: WorkosAuthIdentity) {
    const { user, organization, membership } = await syncWorkosIdentity(db, identity);
    const activeOrganization = {
      workosOrganizationId: organization.workosOrganizationId,
      localOrganizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      membership: {
        workosMembershipId: membership.workosMembershipId,
        role: membership.role,
      },
    };

    globalThis.__testApiAuthContext = {
      user: {
        workosUserId: user.workosUserId,
        localUserId: user.id,
        email: user.email,
      },
      organizations: [activeOrganization],
      organization: activeOrganization,
      activeOrganization,
      membership: {
        workosMembershipId: membership.workosMembershipId,
        role: membership.role,
      },
      activeTeam: null,
    };

    return {
      cookie: "wos-session=test",
    };
  }

  async function getLocalUserId(workosUserId: string) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, workosUserId))
      .limit(1);

    if (!user) {
      throw new Error(`expected local user for ${workosUserId}`);
    }

    return user.id;
  }

  async function cleanup() {
    globalThis.__testApiAuthContext = undefined;

    await cleanupWorkosTestRecords({
      workosOrganizationIds: createdWorkosOrganizationIds,
      workosUserIds: createdWorkosUserIds,
    });

    createdWorkosOrganizationIds.clear();
    createdWorkosUserIds.clear();
  }

  return {
    authHeadersFor,
    cleanup,
    createWorkosIdentity,
    createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole,
    getLocalUserId,
  };
}
