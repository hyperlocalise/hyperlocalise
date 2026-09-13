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

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { upsertGscConnection } from "@/lib/gsc/connections";
import { GSC_OAUTH_SCOPES } from "@/lib/gsc/constants";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

describe("gscConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("lists an empty connection set and starts Google OAuth", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const list = await client.api.orgs[":organizationSlug"]["gsc-connections"].$get(
      { param: { organizationSlug } },
      { headers },
    );
    expect(list.status).toBe(200);
    const body = await list.json();
    if (!("gscConnections" in body)) {
      throw new Error("expected gscConnections");
    }
    expect(body.gscConnections).toEqual([]);
    expect(body.configured).toBe(true);

    const authorize = await client.api.orgs[":organizationSlug"]["gsc-connections"].authorize.$get(
      {
        param: { organizationSlug },
        query: { returnTo: `/org/${organizationSlug}/domains/ld_1/search-console` },
      },
      { headers },
    );
    expect(authorize.status).toBe(302);
    const location = authorize.headers.get("location") ?? "";
    expect(location).toContain("accounts.google.com");
    expect(location).toContain(encodeURIComponent(GSC_OAUTH_SCOPES[3]!));
    expect(location).toContain("access_type=offline");
  });

  it("deletes a connected Search Console grant", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    await upsertGscConnection({
      organizationId: identity.organization.localOrganizationId,
      userId: identity.user.localUserId,
      googleSubject: "subject-1",
      accountEmail: "seo@acme.test",
      refreshToken: "refresh-token",
      accessToken: "access-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: "openid email",
    });

    const deleted = await client.api.orgs[":organizationSlug"]["gsc-connections"].$delete(
      { param: { organizationSlug } },
      { headers },
    );
    expect(deleted.status).toBe(204);
  });
});
