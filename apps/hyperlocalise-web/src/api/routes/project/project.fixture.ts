import { randomUUID } from "node:crypto";

import type { AppType } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { testClient } from "hono/testing";

type CreateProjectInput = Partial<{
  name: string;
  description: string;
  translationContext: string;
}>;

type Client = ReturnType<typeof testClient<AppType>>;

export function createProjectTestFixture(client?: Client) {
  const authFixture = createAuthTestFixture();

  async function createProjectViaApi(identity: WorkosAuthIdentity, input?: CreateProjectInput) {
    if (!client) {
      throw new Error("createProjectViaApi requires a test client");
    }

    return client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
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
    const { identity, organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);

    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: team.id,
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
