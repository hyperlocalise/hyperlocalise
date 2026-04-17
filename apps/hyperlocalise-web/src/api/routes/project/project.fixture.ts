import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { ApiAuthContext, WorkosAuthIdentity } from "@/api/auth/workos";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database";

type CreateProjectInput = Partial<{
  name: string;
  description: string;
  translationContext: string;
}>;

declare global {
  var __testApiAuthContext: ApiAuthContext | undefined;
}

export function createProjectTestFixture(client?: any) {
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

  async function createProjectViaApi(identity: WorkosAuthIdentity, input?: CreateProjectInput) {
    if (!client) {
      throw new Error("createProjectViaApi requires a test client");
    }

    return client.api.project.$post(
      {
        json: {
          name: input?.name ?? "Marketing Site",
          description: input?.description ?? "Primary website strings",
          translationContext: input?.translationContext ?? "Use a concise product-marketing tone.",
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );
  }

  async function authHeadersFor(identity: WorkosAuthIdentity) {
    const { user, organization, membership } = await syncWorkosIdentity(db, identity);

    globalThis.__testApiAuthContext = {
      user: {
        workosUserId: user.workosUserId,
        localUserId: user.id,
        email: user.email,
      },
      organization: {
        workosOrganizationId: organization.workosOrganizationId,
        localOrganizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      membership: {
        workosMembershipId: membership.workosMembershipId,
        role: membership.role,
      },
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

  async function createStoredProjectFixture() {
    const identity = createWorkosIdentity();

    const [organization] = await db
      .insert(schema.organizations)
      .values({
        workosOrganizationId: identity.organization.workosOrganizationId,
        name: identity.organization.name,
        slug: identity.organization.slug ?? null,
      })
      .returning();

    const [user] = await db
      .insert(schema.users)
      .values({
        workosUserId: identity.user.workosUserId,
        email: identity.user.email,
      })
      .returning();

    const [project] = await db
      .insert(schema.translationProjects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Docs",
        description: "",
        translationContext: "",
      })
      .returning();

    return { identity, organization, user, project };
  }

  async function cleanup() {
    globalThis.__testApiAuthContext = undefined;

    for (const workosOrganizationId of createdWorkosOrganizationIds) {
      await db
        .delete(schema.organizations)
        .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId));
    }

    for (const workosUserId of createdWorkosUserIds) {
      await db.delete(schema.users).where(eq(schema.users.workosUserId, workosUserId));
    }

    createdWorkosOrganizationIds.clear();
    createdWorkosUserIds.clear();
  }

  return {
    authHeadersFor,
    cleanup,
    createProjectViaApi,
    createStoredProjectFixture,
    createWorkosIdentity,
    createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole,
    getLocalUserId,
  };
}
