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
import { eq } from "drizzle-orm";

import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "@/lib/security/api-keys";
import { db, schema } from "@/lib/database/client";

import {
  defaultApiKeyPermissions,
  type ApiKeyPermission,
  type CreateApiKeyBody,
} from "./api-key.schema";

type InsertApiKeyInput = {
  organizationId: string;
  name: string;
  createdByUserId?: string;
  permissions?: ApiKeyPermission[];
  revokedAt?: Date;
};

export function createApiKeyTestFixture() {
  const authFixture = createAuthTestFixture();

  async function getLocalOrganizationId(workosOrganizationId: string) {
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId))
      .limit(1);

    if (!organization) {
      throw new Error(`expected local organization for ${workosOrganizationId}`);
    }

    return organization.id;
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

    if (!apiKey) {
      throw new Error("expected api key row");
    }

    return { plainKey, apiKey };
  }

  async function createOwnedApiKey(
    identity: WorkosAuthIdentity,
    input: CreateApiKeyBody = { name: "Production Key" },
  ) {
    await authFixture.authHeadersFor(identity);
    return insertApiKey({
      organizationId: await getLocalOrganizationId(identity.organization.workosOrganizationId),
      createdByUserId: await authFixture.getLocalUserId(identity.user.workosUserId),
      name: input.name,
      permissions: input.permissions,
    });
  }

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createOwnedApiKey,
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalOrganizationId,
    getLocalUserId: authFixture.getLocalUserId,
    insertApiKey,
  };
}
