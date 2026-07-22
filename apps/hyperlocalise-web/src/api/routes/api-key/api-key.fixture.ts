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
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "@/lib/security/api-keys";
import { db, schema } from "@/lib/database";
import { testClient } from "hono/testing";

import {
  defaultApiKeyPermissions,
  type ApiKeyPermission,
  type CreateApiKeyBody,
} from "./api-key.schema";

type Client = ReturnType<typeof testClient<AppType>>;

type InsertApiKeyInput = {
  organizationId: string;
  name: string;
  createdByUserId?: string;
  permissions?: ApiKeyPermission[];
  revokedAt?: Date;
};

export function createApiKeyTestFixture(client?: Client) {
  const authFixture = createAuthTestFixture();

  async function createApiKeyViaApi(
    identity: WorkosAuthIdentity,
    input: CreateApiKeyBody = { name: "Production Key" },
  ) {
    if (!client) {
      throw new Error("createApiKeyViaApi requires a test client");
    }

    return client.api.orgs[":organizationSlug"]["api-keys"].$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: input,
      },
      {
        headers: await authFixture.authHeadersFor(identity),
      },
    );
  }

  async function insertApiKey(input: InsertApiKeyInput) {
    const plainKey = generateApiKey();
    const keyHash = hashApiKey(plainKey);
    const keyPrefix = getApiKeyPrefix(plainKey);

    const [apiKey] = await db
      .insert(schema.organizationApiKeys)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        keyHash,
        keyPrefix,
        permissions: input.permissions ?? [...defaultApiKeyPermissions],
        createdByUserId: input.createdByUserId ?? null,
        revokedAt: input.revokedAt ?? null,
      })
      .returning();

    return { plainKey, apiKey };
  }

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createApiKeyViaApi,
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalUserId: authFixture.getLocalUserId,
    insertApiKey,
  };
}
