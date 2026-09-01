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

import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import {
  err,
  fromThrowableAsync,
  isErr,
  isOk,
  ok,
  type Result,
} from "@/lib/primitives/result/results";

import {
  maskEmailForDisplay,
  slackConnectChannelName,
  slackConnectChannelPurpose,
  slackConnectOrganizationIdFromPurpose,
  slackConnectUniqueChannelName,
} from "./connect-channel-name";

export const SLACK_CONNECT_INVITE_COOLDOWN_MS = 2 * 60 * 1000;

const logger = createLogger("slack-connect");

export type SlackConnectInviteView = {
  available: boolean;
  invited: boolean;
  dismissed: boolean;
  lastInvitedAt: string | null;
  invitedEmailMasked: string | null;
};

export type SlackConnectInviteError =
  | { code: "slack_connect_not_configured" }
  | { code: "slack_connect_rate_limited"; retryAfterSeconds: number }
  | { code: "slack_connect_invite_failed"; slackError?: string };

export type SlackConnectApiError =
  | { code: "slack_api_error"; slackError: string }
  | { code: "slack_http_error"; status: number }
  | { code: "bot_unavailable"; cause: unknown };

export type SlackConnectChannel = { id: string; name: string };

export type SlackConnectChannelInfo = SlackConnectChannel & {
  purpose: string | null;
  archived: boolean;
};

export type SlackConnectApi = {
  createChannel: (name: string) => Promise<Result<SlackConnectChannel, SlackConnectApiError>>;
  findPrivateChannelByName: (
    name: string,
  ) => Promise<Result<SlackConnectChannel | null, SlackConnectApiError>>;
  getChannel: (
    channelId: string,
  ) => Promise<Result<SlackConnectChannelInfo | null, SlackConnectApiError>>;
  setChannelPurpose: (
    channelId: string,
    purpose: string,
  ) => Promise<Result<void, SlackConnectApiError>>;
  inviteUsers: (
    channelId: string,
    userIds: readonly string[],
  ) => Promise<Result<void, SlackConnectApiError>>;
  inviteShared: (
    channelId: string,
    email: string,
    externalLimited: boolean,
  ) => Promise<Result<{ inviteId: string }, SlackConnectApiError>>;
};

type SlackConnectInviteRow = typeof schema.slackConnectInvites.$inferSelect;

export function isSlackConnectConfigured(token = env.SLACK_CONNECT_BOT_TOKEN) {
  return Boolean(token?.trim());
}

export function parseSlackConnectHostUserIds(value = env.SLACK_CONNECT_HOST_USER_IDS) {
  if (!value) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];
}

export function createSlackConnectApi(botToken: string): SlackConnectApi {
  return {
    createChannel: async (name) => {
      const result = await slackMethod<{ channel?: { id?: string; name?: string } }>(
        botToken,
        "conversations.create",
        { name, is_private: true },
      );
      if (isErr(result)) {
        return result;
      }

      const channel = toChannel(result.value.channel);
      if (!channel) {
        return err({ code: "slack_api_error", slackError: "missing_channel" });
      }

      return ok(channel);
    },
    findPrivateChannelByName: async (name) => {
      let cursor: string | undefined;

      do {
        const result = await slackMethod<{
          channels?: Array<{ id?: string; name?: string }>;
          response_metadata?: { next_cursor?: string };
        }>(botToken, "conversations.list", {
          types: "private_channel",
          exclude_archived: true,
          limit: 200,
          ...(cursor ? { cursor } : {}),
        });
        if (isErr(result)) {
          return result;
        }

        const match = (result.value.channels ?? []).find((channel) => channel.name === name);
        const channel = toChannel(match);
        if (channel) {
          return ok(channel);
        }

        cursor = result.value.response_metadata?.next_cursor?.trim() || undefined;
      } while (cursor);

      return ok(null);
    },
    getChannel: async (channelId) => {
      const result = await slackMethod<{
        channel?: {
          id?: string;
          name?: string;
          is_archived?: boolean;
          purpose?: { value?: string };
        };
      }>(botToken, "conversations.info", { channel: channelId });
      if (isErr(result)) {
        if (isMissingChannelError(result.error)) {
          return ok(null);
        }

        return result;
      }

      const channel = result.value.channel;
      if (!channel?.id || !channel.name) {
        return ok(null);
      }

      return ok({
        id: channel.id,
        name: channel.name,
        purpose: channel.purpose?.value?.trim() || null,
        archived: Boolean(channel.is_archived),
      });
    },
    setChannelPurpose: async (channelId, purpose) => {
      const result = await slackMethod(botToken, "conversations.setPurpose", {
        channel: channelId,
        purpose,
      });
      if (isErr(result)) {
        return result;
      }

      return ok(undefined);
    },
    inviteUsers: async (channelId, userIds) => {
      if (userIds.length === 0) {
        return ok(undefined);
      }

      const result = await slackMethod(botToken, "conversations.invite", {
        channel: channelId,
        users: userIds.join(","),
      });
      if (isErr(result) && !isIgnorableInviteError(result.error)) {
        return result;
      }

      return ok(undefined);
    },
    inviteShared: async (channelId, email, externalLimited) => {
      const result = await slackMethod<{ invite_id?: string }>(
        botToken,
        "conversations.inviteShared",
        {
          channel: channelId,
          emails: [email],
          external_limited: externalLimited,
        },
      );
      if (isErr(result)) {
        return result;
      }

      if (!result.value.invite_id) {
        return err({ code: "slack_api_error", slackError: "missing_invite_id" });
      }

      return ok({ inviteId: result.value.invite_id });
    },
  };
}

export async function getSlackConnectInviteView(
  organizationId: string,
): Promise<SlackConnectInviteView> {
  if (!isSlackConnectConfigured()) {
    return unavailableInviteView();
  }

  const invite = await getInviteRow(organizationId);
  return toInviteView(invite);
}

export async function requestSlackConnectInvite(input: {
  organizationId: string;
  organizationSlug: string;
  email: string;
  userId: string;
  now?: () => Date;
  api?: SlackConnectApi;
}): Promise<Result<SlackConnectInviteView, SlackConnectInviteError>> {
  const botToken = env.SLACK_CONNECT_BOT_TOKEN?.trim();
  if (!botToken) {
    return err({ code: "slack_connect_not_configured" });
  }

  const now = input.now?.() ?? new Date();
  const reserved = await reserveInviteSlot(input.organizationId, now);
  if (isErr(reserved)) {
    return reserved;
  }

  const api = input.api ?? createSlackConnectApi(botToken);
  const channelResult = await resolveConnectChannel({
    api,
    existing: reserved.value.row,
    organizationId: input.organizationId,
    organizationSlug: input.organizationSlug,
  });
  if (isErr(channelResult)) {
    await restoreInviteReservation(input.organizationId, reserved.value.previousLastInvitedAt);
    return mapApiError(channelResult.error);
  }

  const inviteResult = await sendSharedInvite(api, channelResult.value.id, input.email);
  if (isErr(inviteResult)) {
    await restoreInviteReservation(input.organizationId, reserved.value.previousLastInvitedAt);
    return mapApiError(inviteResult.error);
  }

  const [saved] = await db
    .update(schema.slackConnectInvites)
    .set({
      slackChannelId: channelResult.value.id,
      slackChannelName: channelResult.value.name,
      lastInviteId: inviteResult.value.inviteId,
      lastInvitedEmail: input.email.trim().toLowerCase(),
      lastInvitedAt: now,
      lastInvitedByUserId: input.userId,
      dismissedAt: null,
      updatedAt: now,
    })
    .where(eq(schema.slackConnectInvites.organizationId, input.organizationId))
    .returning();

  logger.info(
    {
      organizationId: input.organizationId,
      slackChannelId: channelResult.value.id,
      inviteId: inviteResult.value.inviteId,
    },
    "slack connect invite sent",
  );

  return ok(toInviteView(saved ?? reserved.value.row));
}

export async function dismissSlackConnectInvite(
  organizationId: string,
): Promise<SlackConnectInviteView> {
  if (!isSlackConnectConfigured()) {
    return unavailableInviteView();
  }

  const now = new Date();
  const existing = await getInviteRow(organizationId);
  if (!existing) {
    const [created] = await db
      .insert(schema.slackConnectInvites)
      .values({
        organizationId,
        slackChannelId: "pending",
        slackChannelName: "pending",
        dismissedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.slackConnectInvites.organizationId],
        set: { dismissedAt: now, updatedAt: now },
      })
      .returning();

    return toInviteView(created ?? null);
  }

  const [updated] = await db
    .update(schema.slackConnectInvites)
    .set({ dismissedAt: now, updatedAt: now })
    .where(eq(schema.slackConnectInvites.organizationId, organizationId))
    .returning();

  return toInviteView(updated ?? existing);
}

type ReservedInviteSlot = {
  row: SlackConnectInviteRow;
  previousLastInvitedAt: Date | null;
};

async function reserveInviteSlot(
  organizationId: string,
  now: Date,
): Promise<Result<ReservedInviteSlot, SlackConnectInviteError>> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.slackConnectInvites)
      .where(eq(schema.slackConnectInvites.organizationId, organizationId))
      .limit(1)
      .for("update");

    if (existing) {
      const retryAfterSeconds = cooldownRetryAfterSeconds(existing.lastInvitedAt, now);
      if (retryAfterSeconds > 0) {
        return err({ code: "slack_connect_rate_limited", retryAfterSeconds });
      }

      const [updated] = await tx
        .update(schema.slackConnectInvites)
        .set({ lastInvitedAt: now, updatedAt: now })
        .where(eq(schema.slackConnectInvites.organizationId, organizationId))
        .returning();

      return ok({
        row: updated ?? existing,
        previousLastInvitedAt: existing.lastInvitedAt,
      });
    }

    const [created] = await tx
      .insert(schema.slackConnectInvites)
      .values({
        organizationId,
        slackChannelId: "pending",
        slackChannelName: "pending",
        lastInvitedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return ok({ row: created, previousLastInvitedAt: null });
    }

    const [raced] = await tx
      .select()
      .from(schema.slackConnectInvites)
      .where(eq(schema.slackConnectInvites.organizationId, organizationId))
      .limit(1)
      .for("update");

    if (!raced) {
      return err({ code: "slack_connect_invite_failed", slackError: "reserve_failed" });
    }

    const retryAfterSeconds = cooldownRetryAfterSeconds(raced.lastInvitedAt, now);
    if (retryAfterSeconds > 0) {
      return err({ code: "slack_connect_rate_limited", retryAfterSeconds });
    }

    const [updated] = await tx
      .update(schema.slackConnectInvites)
      .set({ lastInvitedAt: now, updatedAt: now })
      .where(eq(schema.slackConnectInvites.organizationId, organizationId))
      .returning();

    return ok({
      row: updated ?? raced,
      previousLastInvitedAt: raced.lastInvitedAt,
    });
  });
}

async function restoreInviteReservation(
  organizationId: string,
  previousLastInvitedAt: Date | null,
) {
  await db
    .update(schema.slackConnectInvites)
    .set({ lastInvitedAt: previousLastInvitedAt, updatedAt: new Date() })
    .where(eq(schema.slackConnectInvites.organizationId, organizationId));
}

async function resolveConnectChannel(input: {
  api: SlackConnectApi;
  existing: SlackConnectInviteRow | null;
  organizationId: string;
  organizationSlug: string;
}): Promise<Result<SlackConnectChannel, SlackConnectApiError>> {
  if (input.existing && input.existing.slackChannelId !== "pending") {
    const current = await input.api.getChannel(input.existing.slackChannelId);
    if (isErr(current)) {
      return current;
    }
    if (current.value && !current.value.archived) {
      return ok({
        id: current.value.id,
        name: current.value.name,
      });
    }
  }

  const name = slackConnectChannelName(
    input.organizationSlug,
    input.organizationId,
    env.SLACK_CONNECT_CHANNEL_PREFIX,
  );
  const created = await input.api.createChannel(name);
  if (isOk(created)) {
    await stampOwnedChannel(input.api, created.value.id, input.organizationId);
    return created;
  }

  if (!isNameTakenError(created.error)) {
    return created;
  }

  const owned = await findOwnedChannelByName(input.api, name, input.organizationId);
  if (isErr(owned)) {
    return owned;
  }
  if (owned.value) {
    await inviteHostUsers(input.api, owned.value.id);
    return ok(owned.value);
  }

  const uniqueName = slackConnectUniqueChannelName(
    input.organizationId,
    env.SLACK_CONNECT_CHANNEL_PREFIX,
  );
  if (uniqueName === name) {
    return err({ code: "slack_api_error", slackError: "name_taken" });
  }

  const uniqueCreated = await input.api.createChannel(uniqueName);
  if (isOk(uniqueCreated)) {
    await stampOwnedChannel(input.api, uniqueCreated.value.id, input.organizationId);
    return uniqueCreated;
  }

  if (!isNameTakenError(uniqueCreated.error)) {
    return uniqueCreated;
  }

  const uniqueOwned = await findOwnedChannelByName(input.api, uniqueName, input.organizationId);
  if (isErr(uniqueOwned)) {
    return uniqueOwned;
  }
  if (uniqueOwned.value) {
    await inviteHostUsers(input.api, uniqueOwned.value.id);
    return ok(uniqueOwned.value);
  }

  return err({ code: "slack_api_error", slackError: "name_taken" });
}

async function findOwnedChannelByName(
  api: SlackConnectApi,
  name: string,
  organizationId: string,
): Promise<Result<SlackConnectChannel | null, SlackConnectApiError>> {
  const found = await api.findPrivateChannelByName(name);
  if (isErr(found) || !found.value) {
    return found;
  }

  const current = await api.getChannel(found.value.id);
  if (isErr(current)) {
    return current;
  }
  if (!current.value || current.value.archived) {
    return ok(null);
  }

  if (slackConnectOrganizationIdFromPurpose(current.value.purpose) !== organizationId) {
    return ok(null);
  }

  return ok({ id: current.value.id, name: current.value.name });
}

async function stampOwnedChannel(api: SlackConnectApi, channelId: string, organizationId: string) {
  const purposeResult = await api.setChannelPurpose(
    channelId,
    slackConnectChannelPurpose(organizationId),
  );
  if (isErr(purposeResult)) {
    logger.warn(
      { slackChannelId: channelId, errorCode: purposeResult.error.code },
      "slack connect channel purpose failed",
    );
  }

  await inviteHostUsers(api, channelId);
}

async function inviteHostUsers(api: SlackConnectApi, channelId: string) {
  const hostUserIds = parseSlackConnectHostUserIds();
  if (hostUserIds.length === 0) {
    return;
  }

  const result = await api.inviteUsers(channelId, hostUserIds);
  if (isErr(result)) {
    logger.warn(
      { slackChannelId: channelId, errorCode: result.error.code },
      "slack connect host invite failed",
    );
  }
}

async function sendSharedInvite(api: SlackConnectApi, channelId: string, email: string) {
  const fullInvite = await api.inviteShared(channelId, email, false);
  if (!isErr(fullInvite) || !isRestrictedInviteError(fullInvite.error)) {
    return fullInvite;
  }

  return api.inviteShared(channelId, email, true);
}

async function getInviteRow(organizationId: string) {
  const [invite] = await db
    .select()
    .from(schema.slackConnectInvites)
    .where(eq(schema.slackConnectInvites.organizationId, organizationId))
    .limit(1);

  return invite ?? null;
}

function toInviteView(invite: SlackConnectInviteRow | null): SlackConnectInviteView {
  return {
    available: true,
    invited: Boolean(invite?.lastInviteId),
    dismissed: Boolean(invite?.dismissedAt),
    lastInvitedAt: invite?.lastInvitedAt?.toISOString() ?? null,
    invitedEmailMasked: invite?.lastInvitedEmail
      ? maskEmailForDisplay(invite.lastInvitedEmail)
      : null,
  };
}

function unavailableInviteView(): SlackConnectInviteView {
  return {
    available: false,
    invited: false,
    dismissed: false,
    lastInvitedAt: null,
    invitedEmailMasked: null,
  };
}

function cooldownRetryAfterSeconds(lastInvitedAt: Date | null | undefined, now: Date) {
  if (!lastInvitedAt) {
    return 0;
  }

  const elapsed = now.getTime() - lastInvitedAt.getTime();
  if (elapsed >= SLACK_CONNECT_INVITE_COOLDOWN_MS) {
    return 0;
  }

  return Math.ceil((SLACK_CONNECT_INVITE_COOLDOWN_MS - elapsed) / 1000);
}

function mapApiError(error: SlackConnectApiError): Result<never, SlackConnectInviteError> {
  return err({
    code: "slack_connect_invite_failed",
    slackError: error.code === "slack_api_error" ? error.slackError : error.code,
  });
}

function isNameTakenError(error: SlackConnectApiError) {
  return error.code === "slack_api_error" && error.slackError === "name_taken";
}

function isMissingChannelError(error: SlackConnectApiError) {
  return (
    error.code === "slack_api_error" &&
    (error.slackError === "channel_not_found" || error.slackError === "invalid_channel")
  );
}

function isRestrictedInviteError(error: SlackConnectApiError) {
  return error.code === "slack_api_error" && error.slackError === "restricted_action";
}

function isIgnorableInviteError(error: SlackConnectApiError) {
  return (
    error.code === "slack_api_error" &&
    (error.slackError === "already_in_channel" ||
      error.slackError === "cant_invite_self" ||
      error.slackError === "cant_invite")
  );
}

function toChannel(
  channel: { id?: string; name?: string } | undefined,
): SlackConnectChannel | null {
  if (!channel?.id || !channel.name) {
    return null;
  }

  return { id: channel.id, name: channel.name };
}

type SlackMethodBody = {
  ok?: boolean;
  error?: string;
};

async function slackMethod<T extends object>(
  botToken: string,
  method: string,
  body: Record<string, string | number | boolean | string[]>,
): Promise<Result<T & SlackMethodBody, SlackConnectApiError>> {
  const responseResult = await fromThrowableAsync(
    fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${botToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      redirect: "error",
    }),
  );
  if (isErr(responseResult)) {
    return err({ code: "bot_unavailable", cause: responseResult.error });
  }

  if (!responseResult.value.ok) {
    return err({ code: "slack_http_error", status: responseResult.value.status });
  }

  const jsonResult = await fromThrowableAsync(
    responseResult.value.json() as Promise<T & SlackMethodBody>,
  );
  if (isErr(jsonResult)) {
    return err({ code: "bot_unavailable", cause: jsonResult.error });
  }

  if (!jsonResult.value.ok) {
    return err({
      code: "slack_api_error",
      slackError: jsonResult.value.error ?? "unknown",
    });
  }

  return ok(jsonResult.value);
}
