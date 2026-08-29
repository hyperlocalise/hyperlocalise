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
import "dotenv/config";

import { type SQL } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import type { ApiAuthContext, WorkosAuthIdentity } from "@/api/auth/workos";
import { db, schema } from "@/lib/database/client";
import { syncWorkosIdentityToAuthContext } from "@/test/auth-seed";

import { createApiKeyTestFixture } from "./api-key.fixture";
import { revocableApiKeyWhere, visibleApiKeysWhere } from "./api-key.shared";

const fixture = createApiKeyTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

async function authContextFor(identity: WorkosAuthIdentity): Promise<ApiAuthContext> {
  const { authContext } = await syncWorkosIdentityToAuthContext(identity);
  return authContext;
}

async function selectApiKeyNames(where: SQL | undefined) {
  const rows = await db
    .select({ name: schema.organizationApiKeys.name })
    .from(schema.organizationApiKeys)
    .where(where);

  return rows.map((row) => row.name).sort();
}

describe("api key ownership predicates", () => {
  it("scopes listing to the owner unless the caller administers tokens", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const memberIdentity = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );

    const adminAuth = await authContextFor(adminIdentity);
    const memberAuth = await authContextFor(memberIdentity);
    const organizationId = adminAuth.organization.localOrganizationId;

    await fixture.insertApiKey({
      organizationId,
      name: "admin-owned",
      createdByUserId: adminAuth.user.localUserId,
    });
    await fixture.insertApiKey({
      organizationId,
      name: "member-owned",
      createdByUserId: memberAuth.user.localUserId,
    });
    await fixture.insertApiKey({ organizationId, name: "legacy-unowned" });

    expect(await selectApiKeyNames(visibleApiKeysWhere(memberAuth))).toEqual(["member-owned"]);
    expect(await selectApiKeyNames(visibleApiKeysWhere(adminAuth))).toEqual([
      "admin-owned",
      "legacy-unowned",
      "member-owned",
    ]);
  });

  it("keeps listing scoped to the caller's organization", async () => {
    const identityA = fixture.createWorkosIdentity();
    const identityB = fixture.createWorkosIdentity();

    const authA = await authContextFor(identityA);
    const authB = await authContextFor(identityB);

    await fixture.insertApiKey({
      organizationId: authA.organization.localOrganizationId,
      name: "org-a-key",
      createdByUserId: authA.user.localUserId,
    });

    expect(await selectApiKeyNames(visibleApiKeysWhere(authA))).toEqual(["org-a-key"]);
    expect(await selectApiKeyNames(visibleApiKeysWhere(authB))).toEqual([]);
  });

  it("matches a revocable token only for its owner or a token administrator", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const memberIdentity = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );

    const adminAuth = await authContextFor(adminIdentity);
    const memberAuth = await authContextFor(memberIdentity);
    const organizationId = adminAuth.organization.localOrganizationId;

    const { apiKey: adminKey } = await fixture.insertApiKey({
      organizationId,
      name: "admin-owned",
      createdByUserId: adminAuth.user.localUserId,
    });
    const { apiKey: memberKey } = await fixture.insertApiKey({
      organizationId,
      name: "member-owned",
      createdByUserId: memberAuth.user.localUserId,
    });

    expect(await selectApiKeyNames(revocableApiKeyWhere(memberAuth, memberKey.id))).toEqual([
      "member-owned",
    ]);
    expect(await selectApiKeyNames(revocableApiKeyWhere(memberAuth, adminKey.id))).toEqual([]);
    expect(await selectApiKeyNames(revocableApiKeyWhere(adminAuth, memberKey.id))).toEqual([
      "member-owned",
    ]);
  });
});
