import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { AUTH_CONTEXT_HEADER, type WorkosAuthIdentity } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

type CreateGlossaryInput = Partial<{
  name: string;
  description: string;
  sourceLocale: string;
  targetLocale: string;
}>;

export function createGlossaryTestFixture(client?: any) {
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

  async function createGlossaryViaApi(identity: WorkosAuthIdentity, input?: CreateGlossaryInput) {
    if (!client) {
      throw new Error("createGlossaryViaApi requires a test client");
    }

    return client.api.glossary.$post(
      {
        json: {
          name: input?.name ?? "Marketing Glossary",
          description: input?.description ?? "Marketing terminology",
          sourceLocale: input?.sourceLocale ?? "en",
          targetLocale: input?.targetLocale ?? "es",
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );
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

  async function createStoredGlossaryFixture() {
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

    const [glossary] = await db
      .insert(schema.translationGlossaries)
      .values({
        id: `glossary_${randomUUID()}`,
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Test Glossary",
        description: "Test description",
        sourceLocale: "en",
        targetLocale: "es",
      })
      .returning();

    return { identity, organization, user, glossary };
  }

  async function cleanup() {
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
    cleanup,
    createGlossaryViaApi,
    createStoredGlossaryFixture,
    createWorkosIdentity,
    createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole,
    getLocalUserId,
  };
}
