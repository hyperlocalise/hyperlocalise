import type { AppType } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { testClient } from "hono/testing";

type CreateMemoryInput = Partial<{
  name: string;
  description: string;
}>;

type Client = ReturnType<typeof testClient<AppType>>;

export function createMemoryTestFixture(client?: Client) {
  const authFixture = createAuthTestFixture();

  async function createMemoryViaApi(identity: WorkosAuthIdentity, input?: CreateMemoryInput) {
    if (!client) {
      throw new Error("createMemoryViaApi requires a test client");
    }

    return client.api.orgs[":organizationSlug"]["translation-memories"].$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: input?.name ?? "Product TM",
          description: input?.description ?? "Product translation memory",
        },
      },
      {
        headers: await authFixture.authHeadersFor(identity),
      },
    );
  }

  async function createStoredMemoryFixture() {
    const { identity, organization, user } = await authFixture.createLocalWorkosIdentity();

    const [memory] = await db
      .insert(schema.memories)
      .values({
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Test TM",
        description: "Test description",
      })
      .returning();

    return { identity, organization, user, memory };
  }

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createMemoryViaApi,
    createStoredMemoryFixture,
    createLocalWorkosIdentity: authFixture.createLocalWorkosIdentity,
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalUserId: authFixture.getLocalUserId,
  };
}
