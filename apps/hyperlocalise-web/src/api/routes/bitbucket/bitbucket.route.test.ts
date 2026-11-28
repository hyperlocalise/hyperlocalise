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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  getBitbucketConnectionStatus: vi.fn(),
  createBitbucketAuthorizeUrl: vi.fn(),
  disconnectBitbucket: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/bitbucket/pipes", () => ({
  getBitbucketConnectionStatus: mocks.getBitbucketConnectionStatus,
  createBitbucketAuthorizeUrl: mocks.createBitbucketAuthorizeUrl,
  disconnectBitbucket: mocks.disconnectBitbucket,
}));

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { ok } from "@/lib/primitives/result/results";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

function connection() {
  return client.api.orgs[":organizationSlug"].bitbucket.connection;
}

describe("bitbucketRoutes", () => {
  beforeEach(() => {
    mocks.getBitbucketConnectionStatus.mockResolvedValue(
      ok({ connected: true, needsReconnect: false, connectorLeft: false, accountName: "Acme" }),
    );
    mocks.createBitbucketAuthorizeUrl.mockResolvedValue(ok({ url: "https://workos.test/auth" }));
    mocks.disconnectBitbucket.mockResolvedValue(ok(undefined));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("shows the workspace's connection to anyone who can see integrations", async () => {
    const identity = fixture.createWorkosIdentityWithRole("developer");
    const headers = await fixture.authHeadersFor(identity);

    const response = await connection().$get(
      { param: { organizationSlug: identity.organization.slug ?? "" } },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      bitbucketConnection: {
        connected: true,
        needsReconnect: false,
        connectorLeft: false,
        accountName: "Acme",
      },
    });
  });

  it("starts an admin's sign-in for the workspace and brings them back to Integrations", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "";

    const response = await connection()["authorize-url"].$get(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: "https://workos.test/auth" });
    expect(mocks.createBitbucketAuthorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        workosUserId: identity.user.workosUserId,
        returnTo: expect.stringContaining(
          `/org/${organizationSlug}/integrations?pipesCallback=bitbucket`,
        ),
      }),
    );
  });

  it("lets only those who manage integrations connect or disconnect", async () => {
    const identity = fixture.createWorkosIdentityWithRole("developer");
    const headers = await fixture.authHeadersFor(identity);
    const param = { organizationSlug: identity.organization.slug ?? "" };

    const authorize = await connection()["authorize-url"].$get({ param }, { headers });
    const disconnect = await connection().$delete({ param }, { headers });

    expect(authorize.status).toBe(403);
    expect(disconnect.status).toBe(403);
    expect(mocks.createBitbucketAuthorizeUrl).not.toHaveBeenCalled();
    expect(mocks.disconnectBitbucket).not.toHaveBeenCalled();
  });

  it("disconnects the workspace's Bitbucket", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await connection().$delete(
      { param: { organizationSlug: identity.organization.slug ?? "" } },
      { headers },
    );

    expect(response.status).toBe(204);
    expect(mocks.disconnectBitbucket).toHaveBeenCalledTimes(1);
  });
});
