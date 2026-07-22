/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
