/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
      defaultModel: "gpt-5.5",
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
