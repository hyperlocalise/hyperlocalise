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

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { err, isErr, ok } from "@/lib/primitives/result/results";

import {
  slackConnectChannelName,
  slackConnectChannelPurpose,
  slackConnectUniqueChannelName,
} from "./connect-channel-name";

const envState = vi.hoisted(() => ({
  SLACK_CONNECT_BOT_TOKEN: "xoxb-test-connect" as string | undefined,
  SLACK_CONNECT_HOST_USER_IDS: "UHOST1" as string | undefined,
  SLACK_CONNECT_CHANNEL_PREFIX: "ext" as string | undefined,
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    env: new Proxy(actual.env, {
      get(target, property, receiver) {
        if (property in envState) {
          return envState[property as keyof typeof envState];
        }
        return Reflect.get(target, property, receiver);
      },
    }),
  };
});

import {
  createSlackConnectApi,
  dismissSlackConnectInvite,
  getSlackConnectInviteView,
  requestSlackConnectInvite,
  type SlackConnectApi,
} from "./connect-invite";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  envState.SLACK_CONNECT_BOT_TOKEN = "xoxb-test-connect";
  vi.unstubAllGlobals();
  await authFixture.cleanup();
});

function createApi(overrides: Partial<SlackConnectApi> = {}): SlackConnectApi {
  return {
    createChannel: vi.fn().mockResolvedValue(ok({ id: "C123", name: "ext-acme-11111111" })),
    findPrivateChannelByName: vi.fn().mockResolvedValue(ok(null)),
    getChannelPurpose: vi.fn().mockResolvedValue(ok(null)),
    setChannelPurpose: vi.fn().mockResolvedValue(ok(undefined)),
    inviteUsers: vi.fn().mockResolvedValue(ok(undefined)),
    inviteShared: vi.fn().mockResolvedValue(ok({ inviteId: "I123" })),
    ...overrides,
  };
}

function slackJsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}

describe("slack connect invites", () => {
  it("hides the banner when Slack Connect is not configured", async () => {
    envState.SLACK_CONNECT_BOT_TOKEN = undefined;
    const { organization } = await authFixture.createLocalWorkosIdentity();

    await expect(getSlackConnectInviteView(organization.id)).resolves.toEqual({
      available: false,
      invited: false,
      dismissed: false,
      lastInvitedAt: null,
      invitedEmailMasked: null,
    });
  });

  it("creates a private channel and emails a Slack Connect invite", async () => {
    const { organization, user, identity } = await authFixture.createLocalWorkosIdentity();
    const api = createApi();
    const slug = identity.organization.slug ?? "acme";
    const expectedName = slackConnectChannelName(slug, organization.id);

    const result = await requestSlackConnectInvite({
      organizationId: organization.id,
      organizationSlug: slug,
      email: user.email,
      userId: user.id,
      api,
    });

    expect(result.ok).toBe(true);
    if (isErr(result)) {
      throw new Error("expected invite success");
    }
    expect(result.value.available).toBe(true);
    expect(result.value.invited).toBe(true);
    expect(result.value.dismissed).toBe(false);
    expect(result.value.invitedEmailMasked?.endsWith(`@${user.email.split("@")[1]}`)).toBe(true);
    expect(api.createChannel).toHaveBeenCalledWith(expectedName);
    expect(api.setChannelPurpose).toHaveBeenCalledWith(
      "C123",
      slackConnectChannelPurpose(organization.id),
    );
    expect(api.inviteUsers).toHaveBeenCalledWith("C123", ["UHOST1"]);
    expect(api.inviteShared).toHaveBeenCalledWith("C123", user.email, false);
  });

  it("reuses the stored channel on a later invite", async () => {
    const { organization, user, identity } = await authFixture.createLocalWorkosIdentity();
    const firstApi = createApi();
    await requestSlackConnectInvite({
      organizationId: organization.id,
      organizationSlug: identity.organization.slug ?? "acme",
      email: user.email,
      userId: user.id,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
      api: firstApi,
    });

    const secondApi = createApi({
      inviteShared: vi.fn().mockResolvedValue(ok({ inviteId: "I999" })),
    });
    const result = await requestSlackConnectInvite({
      organizationId: organization.id,
      organizationSlug: identity.organization.slug ?? "acme",
      email: user.email,
      userId: user.id,
      now: () => new Date("2026-09-01T00:05:00.000Z"),
      api: secondApi,
    });

    expect(result.ok).toBe(true);
    expect(secondApi.createChannel).not.toHaveBeenCalled();
    expect(secondApi.inviteShared).toHaveBeenCalledWith("C123", user.email, false);
  });

  it("does not adopt a name-taken channel owned by another workspace", async () => {
    const { organization, user, identity } = await authFixture.createLocalWorkosIdentity();
    const slug = identity.organization.slug ?? "acme";
    const uniqueName = slackConnectUniqueChannelName(organization.id);
    const createChannel = vi
      .fn()
      .mockResolvedValueOnce(err({ code: "slack_api_error", slackError: "name_taken" }))
      .mockResolvedValueOnce(ok({ id: "CNEW", name: uniqueName }));
    const api = createApi({
      createChannel,
      findPrivateChannelByName: vi.fn().mockResolvedValue(ok({ id: "COLD", name: "ext-acme" })),
      getChannelPurpose: vi
        .fn()
        .mockResolvedValue(ok(slackConnectChannelPurpose("00000000-0000-4000-8000-000000000000"))),
    });

    const result = await requestSlackConnectInvite({
      organizationId: organization.id,
      organizationSlug: slug,
      email: user.email,
      userId: user.id,
      api,
    });

    expect(result.ok).toBe(true);
    expect(createChannel).toHaveBeenNthCalledWith(2, uniqueName);
    expect(api.inviteShared).toHaveBeenCalledWith("CNEW", user.email, false);
  });

  it("reuses a name-taken channel only when the purpose matches this workspace", async () => {
    const { organization, user, identity } = await authFixture.createLocalWorkosIdentity();
    const slug = identity.organization.slug ?? "acme";
    const expectedName = slackConnectChannelName(slug, organization.id);
    const api = createApi({
      createChannel: vi
        .fn()
        .mockResolvedValue(err({ code: "slack_api_error", slackError: "name_taken" })),
      findPrivateChannelByName: vi.fn().mockResolvedValue(ok({ id: "COWN", name: expectedName })),
      getChannelPurpose: vi.fn().mockResolvedValue(ok(slackConnectChannelPurpose(organization.id))),
    });

    const result = await requestSlackConnectInvite({
      organizationId: organization.id,
      organizationSlug: slug,
      email: user.email,
      userId: user.id,
      api,
    });

    expect(result.ok).toBe(true);
    expect(api.inviteShared).toHaveBeenCalledWith("COWN", user.email, false);
    expect(api.createChannel).toHaveBeenCalledTimes(1);
  });

  it("rate limits repeat invites within two minutes", async () => {
    const { organization, user, identity } = await authFixture.createLocalWorkosIdentity();
    const api = createApi();
    await requestSlackConnectInvite({
      organizationId: organization.id,
      organizationSlug: identity.organization.slug ?? "acme",
      email: user.email,
      userId: user.id,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
      api,
    });

    const result = await requestSlackConnectInvite({
      organizationId: organization.id,
      organizationSlug: identity.organization.slug ?? "acme",
      email: user.email,
      userId: user.id,
      now: () => new Date("2026-09-01T00:01:00.000Z"),
      api,
    });

    expect(result.ok).toBe(false);
    if (!isErr(result)) {
      throw new Error("expected rate limit");
    }
    expect(result.error.code).toBe("slack_connect_rate_limited");
    expect(api.inviteShared).toHaveBeenCalledTimes(1);
  });

  it("retries with a limited invite when Slack forbids full Connect permissions", async () => {
    const { organization, user, identity } = await authFixture.createLocalWorkosIdentity();
    const inviteShared = vi
      .fn()
      .mockResolvedValueOnce(err({ code: "slack_api_error", slackError: "restricted_action" }))
      .mockResolvedValueOnce(ok({ inviteId: "I-LIMITED" }));

    const result = await requestSlackConnectInvite({
      organizationId: organization.id,
      organizationSlug: identity.organization.slug ?? "acme",
      email: user.email,
      userId: user.id,
      api: createApi({ inviteShared }),
    });

    expect(result.ok).toBe(true);
    expect(inviteShared).toHaveBeenNthCalledWith(1, "C123", user.email, false);
    expect(inviteShared).toHaveBeenNthCalledWith(2, "C123", user.email, true);
  });

  it("dismisses the workspace banner", async () => {
    const { organization, user, identity } = await authFixture.createLocalWorkosIdentity();
    await requestSlackConnectInvite({
      organizationId: organization.id,
      organizationSlug: identity.organization.slug ?? "acme",
      email: user.email,
      userId: user.id,
      api: createApi(),
    });

    const dismissed = await dismissSlackConnectInvite(organization.id);
    expect(dismissed.dismissed).toBe(true);
    expect(dismissed.invited).toBe(true);
  });
});

describe("createSlackConnectApi", () => {
  it("pages through private channels until the name is found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        slackJsonResponse({
          ok: true,
          channels: [{ id: "C1", name: "other" }],
          response_metadata: { next_cursor: "page2" },
        }),
      )
      .mockResolvedValueOnce(
        slackJsonResponse({
          ok: true,
          channels: [{ id: "C2", name: "ext-acme-11111111" }],
          response_metadata: { next_cursor: "" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result =
      await createSlackConnectApi("xoxb-test").findPrivateChannelByName("ext-acme-11111111");

    expect(result.ok).toBe(true);
    if (isErr(result)) {
      throw new Error("expected channel page match");
    }
    expect(result.value).toEqual({ id: "C2", name: "ext-acme-11111111" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      cursor: "page2",
    });
  });
});
