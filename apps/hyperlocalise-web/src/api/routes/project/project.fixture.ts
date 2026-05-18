import { randomUUID } from "node:crypto";

import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { createAuthTestFixture } from "../auth.fixture";

type CreateProjectInput = Partial<{
  name: string;
  description: string;
  translationContext: string;
}>;

export function createProjectTestFixture(client?: any) {
  const authFixture = createAuthTestFixture();

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
        headers: await authFixture.authHeadersFor(identity),
      },
    );
  }

  async function createStoredProjectFixture() {
    const identity = authFixture.createWorkosIdentity();

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
      .insert(schema.projects)
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

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createProjectViaApi,
    createStoredProjectFixture,
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalUserId: authFixture.getLocalUserId,
  };
}
