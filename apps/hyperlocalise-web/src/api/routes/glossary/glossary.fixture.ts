import type { AppType } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { testClient } from "hono/testing";

type CreateGlossaryInput = Partial<{
  name: string;
  description: string;
  sourceLocale: string;
  targetLocale: string;
}>;

type Client = ReturnType<typeof testClient<AppType>>;

export function createGlossaryTestFixture(client?: Client) {
  const authFixture = createAuthTestFixture();

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
        headers: await authFixture.authHeadersFor(identity),
      },
    );
  }

  async function createStoredGlossaryFixture() {
    const { identity, organization, user } = await authFixture.createLocalWorkosIdentity();

    const [glossary] = await db
      .insert(schema.glossaries)
      .values({
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

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createGlossaryViaApi,
    createStoredGlossaryFixture,
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalUserId: authFixture.getLocalUserId,
  };
}
