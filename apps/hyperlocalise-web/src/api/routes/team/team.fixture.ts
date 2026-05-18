import type { AppType } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { testClient } from "hono/testing";

import type { CreateTeamBody } from "./team.schema";

type Client = ReturnType<typeof testClient<AppType>>;

export function createTeamTestFixture(client?: Client) {
  const authFixture = createAuthTestFixture();

  async function createTeamViaApi(
    identity: WorkosAuthIdentity,
    input: CreateTeamBody = { name: "Platform" },
  ) {
    if (!client) {
      throw new Error("createTeamViaApi requires a test client");
    }

    return client.api.orgs[":organizationSlug"].teams.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: input,
      },
      {
        headers: await authFixture.authHeadersFor(identity),
      },
    );
  }

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createTeamViaApi,
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalUserId: authFixture.getLocalUserId,
  };
}
