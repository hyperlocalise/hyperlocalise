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
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";

import {
  deleteGscConnection,
  getGscConnection,
  mintGscAccessToken,
  upsertGscConnection,
} from "./connections";

const fixture = createAuthTestFixture();

function testOrgIds() {
  const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId;
  const userId = globalThis.__testApiAuthContext?.user.localUserId;
  if (!organizationId || !userId) {
    throw new Error("expected synced test organization");
  }
  return { organizationId, userId };
}

describe("gsc connections", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("upserts and mints a cached access token", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);

    const { organizationId, userId } = testOrgIds();
    const created = await upsertGscConnection({
      organizationId,
      userId,
      googleSubject: "subject-1",
      accountEmail: "seo@acme.test",
      refreshToken: "refresh-token",
      accessToken: "access-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: "openid email",
    });

    expect(created.accountEmail).toBe("seo@acme.test");
    expect(await getGscConnection({ organizationId })).toMatchObject({
      accountEmail: "seo@acme.test",
    });

    const minted = await mintGscAccessToken({
      organizationId,
    });
    expect(minted.ok).toBe(true);
    if (minted.ok) {
      expect(minted.value.accessToken).toBe("access-token");
    }
  });

  it("refreshes an expired access token", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);

    const { organizationId, userId } = testOrgIds();
    await upsertGscConnection({
      organizationId,
      userId,
      googleSubject: "subject-2",
      accountEmail: "seo@acme.test",
      refreshToken: "refresh-token",
      accessToken: "stale-token",
      accessTokenExpiresAt: new Date(Date.now() - 60_000),
      scopes: "openid email",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ access_token: "fresh-token", expires_in: 3600 }),
          { status: 200 },
        ),
      ),
    );

    const minted = await mintGscAccessToken({
      organizationId,
    });
    expect(minted.ok).toBe(true);
    if (minted.ok) {
      expect(minted.value.accessToken).toBe("fresh-token");
    }
  });

  it("deletes the org connection", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);

    const { organizationId, userId } = testOrgIds();
    await upsertGscConnection({
      organizationId,
      userId,
      googleSubject: "subject-3",
      accountEmail: "seo@acme.test",
      refreshToken: "refresh-token",
      accessToken: "access-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: "openid email",
    });

    await expect(
      deleteGscConnection({ organizationId }),
    ).resolves.toBe(true);
    await expect(
      getGscConnection({ organizationId }),
    ).resolves.toBeNull();
  });
});
