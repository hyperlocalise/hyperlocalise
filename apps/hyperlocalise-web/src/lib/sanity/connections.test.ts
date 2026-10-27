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
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApiKeyTestFixture } from "@/api/routes/api-key/api-key.fixture";
import { db, schema } from "@/lib/database/client";

import {
  createSanityConnection,
  ensureSanityStudioPluginConnection,
  listSanityConnections,
} from "./connections";

const apiKeyFixture = createApiKeyTestFixture();

describe("ensureSanityStudioPluginConnection", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await apiKeyFixture.cleanup();
  });

  it("reuses an enabled connection whose API key is still valid", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity Studio plugin",
    });
    const created = await createSanityConnection({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity Studio plugin",
      apiKeyId: apiKey.id,
    });

    const ensured = await ensureSanityStudioPluginConnection({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
    });

    expect(ensured.id).toBe(created.connection.id);
    expect(ensured.apiKeyId).toBe(apiKey.id);
    const listed = await listSanityConnections({
      organizationId: auth.organization.localOrganizationId,
    });
    expect(listed).toHaveLength(1);
  });

  it("replaces the backing API key when the enabled connection key was revoked", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity Studio plugin",
    });
    const created = await createSanityConnection({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity Studio plugin",
      apiKeyId: apiKey.id,
    });
    await db
      .update(schema.organizationApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.organizationApiKeys.id, apiKey.id));

    const repaired = await ensureSanityStudioPluginConnection({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
    });

    expect(repaired.id).toBe(created.connection.id);
    expect(repaired.apiKeyId).not.toBe(apiKey.id);
    const [replacement] = await db
      .select({
        revokedAt: schema.organizationApiKeys.revokedAt,
        createdByUserId: schema.organizationApiKeys.createdByUserId,
      })
      .from(schema.organizationApiKeys)
      .where(eq(schema.organizationApiKeys.id, repaired.apiKeyId))
      .limit(1);
    expect(replacement?.revokedAt).toBeNull();
    expect(replacement?.createdByUserId).toBe(auth.user.localUserId);
  });
});
