import type { AppType } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { testClient } from "hono/testing";

import type { UpdateProviderCredentialBody } from "./provider-credential.schema";

type Client = ReturnType<typeof testClient<AppType>>;

export function createProviderCredentialTestFixture(client?: Client) {
  const authFixture = createAuthTestFixture();

  async function upsertProviderCredentialViaApi(
    identity: WorkosAuthIdentity,
    input: UpdateProviderCredentialBody = {
      provider: "openai",
      apiKey: "sk-live-provider-key",
      defaultModel: "gpt-4.1-mini",
    },
  ) {
    if (!client) {
      throw new Error("upsertProviderCredentialViaApi requires a test client");
    }

    return client.api.orgs[":organizationSlug"]["provider-credential"].$put(
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
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalUserId: authFixture.getLocalUserId,
    upsertProviderCredentialViaApi,
  };
}
