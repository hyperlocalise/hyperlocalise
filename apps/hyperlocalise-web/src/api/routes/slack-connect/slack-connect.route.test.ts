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
  getSlackConnectInviteView: vi.fn(),
  requestSlackConnectInvite: vi.fn(),
  dismissSlackConnectInvite: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/agents/slack/connect-invite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/slack/connect-invite")>();
  return {
    ...actual,
    getSlackConnectInviteView: mocks.getSlackConnectInviteView,
    requestSlackConnectInvite: mocks.requestSlackConnectInvite,
    dismissSlackConnectInvite: mocks.dismissSlackConnectInvite,
  };
});

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { err, ok } from "@/lib/primitives/result/results";

const client = testClient(createApp());
const authFixture = createAuthTestFixture();

const invitedView = {
  available: true,
  invited: true,
  dismissed: false,
  lastInvitedAt: "2026-09-01T00:00:00.000Z",
  invitedEmailMasked: "m***@acme.com",
};

const invitedManagedView = {
  ...invitedView,
  canManage: true,
};

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await authFixture.cleanup();
});

describe("slack-connect routes", () => {
  it("returns the current Slack Connect banner state", async () => {
    const identity = authFixture.createWorkosIdentityWithRole("admin");
    mocks.getSlackConnectInviteView.mockResolvedValue(invitedView);

    const response = await client.api.orgs[":organizationSlug"]["slack-connect"].$get(
      { param: { organizationSlug: identity.organization.slug ?? "missing" } },
      { headers: await authFixture.authHeadersFor(identity) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slackConnect: invitedManagedView });
  });

  it("lets read-only members load the banner but not mutate it", async () => {
    const identity = authFixture.createWorkosIdentityWithRole("member");
    mocks.getSlackConnectInviteView.mockResolvedValue(invitedView);

    const headers = await authFixture.authHeadersFor(identity);
    const getResponse = await client.api.orgs[":organizationSlug"]["slack-connect"].$get(
      { param: { organizationSlug: identity.organization.slug ?? "missing" } },
      { headers },
    );
    const postResponse = await client.api.orgs[":organizationSlug"]["slack-connect"].$post(
      { param: { organizationSlug: identity.organization.slug ?? "missing" } },
      { headers },
    );
    const patchResponse = await client.api.orgs[":organizationSlug"]["slack-connect"].$patch(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: { dismissed: true },
      },
      { headers },
    );

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({
      slackConnect: { ...invitedView, canManage: false },
    });
    expect(postResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
    expect(mocks.requestSlackConnectInvite).not.toHaveBeenCalled();
    expect(mocks.dismissSlackConnectInvite).not.toHaveBeenCalled();
  });

  it("sends a Slack Connect invite for the signed-in user", async () => {
    const identity = authFixture.createWorkosIdentityWithRole("admin");
    mocks.requestSlackConnectInvite.mockResolvedValue(ok(invitedView));

    const response = await client.api.orgs[":organizationSlug"]["slack-connect"].$post(
      { param: { organizationSlug: identity.organization.slug ?? "missing" } },
      { headers: await authFixture.authHeadersFor(identity) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requestSlackConnectInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationSlug: identity.organization.slug,
        email: identity.user.email,
      }),
    );
    expect(await response.json()).toEqual({ slackConnect: invitedManagedView });
  });

  it("maps Slack Connect rate limits to 429", async () => {
    const identity = authFixture.createWorkosIdentityWithRole("admin");
    mocks.requestSlackConnectInvite.mockResolvedValue(
      err({ code: "slack_connect_rate_limited", retryAfterSeconds: 90 }),
    );

    const response = await client.api.orgs[":organizationSlug"]["slack-connect"].$post(
      { param: { organizationSlug: identity.organization.slug ?? "missing" } },
      { headers: await authFixture.authHeadersFor(identity) },
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "slack_connect_rate_limited",
      details: { retryAfterSeconds: 90 },
    });
  });

  it("dismisses the banner", async () => {
    const identity = authFixture.createWorkosIdentityWithRole("admin");
    mocks.dismissSlackConnectInvite.mockResolvedValue({
      ...invitedView,
      dismissed: true,
    });

    const response = await client.api.orgs[":organizationSlug"]["slack-connect"].$patch(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: { dismissed: true },
      },
      { headers: await authFixture.authHeadersFor(identity) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      slackConnect: { ...invitedManagedView, dismissed: true },
    });
  });
});
