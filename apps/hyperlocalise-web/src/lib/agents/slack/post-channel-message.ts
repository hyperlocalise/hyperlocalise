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
import { Chat, type Adapter } from "chat";

import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import {
  findSlackConnectorForOrganization,
  getSlackConnectorTeamId,
} from "@/lib/agents/slack/helpers";
import { env } from "@/lib/env";

type SlackChat = Chat<{ slack: Adapter<unknown, unknown> }>;

type SlackOutboundAdapter = {
  getInstallation: (teamId: string) => Promise<{ botToken?: string } | null>;
  postChannelMessage: (channelId: string, message: string) => Promise<unknown>;
  withBotToken: <T>(token: string, fn: () => T, options?: { installationId?: string }) => T;
};

let slackChatPromise: Promise<SlackChat> | null = null;

async function getSlackChat(): Promise<SlackChat> {
  if (slackChatPromise) {
    return slackChatPromise;
  }

  slackChatPromise = initializeSlackChat().catch((error: unknown) => {
    slackChatPromise = null;
    throw error;
  });
  return slackChatPromise;
}

async function initializeSlackChat(): Promise<SlackChat> {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_SIGNING_SECRET) {
    throw new Error("missing Slack bot configuration");
  }

  const { createSlackAdapter } = await import("@chat-adapter/slack");

  const slackChat = new Chat({
    adapters: {
      slack: createSlackAdapter({
        clientId: env.SLACK_CLIENT_ID,
        clientSecret: env.SLACK_CLIENT_SECRET,
        signingSecret: env.SLACK_SIGNING_SECRET,
        userName: "hyperlocalise",
      }),
    },
    state: createChatStateAdapter(),
    userName: "hyperlocalise",
  });

  await slackChat.initialize();
  return slackChat;
}

function toCanonicalSlackChannelId(channelId: string) {
  return channelId.startsWith("slack:") ? channelId : `slack:${channelId}`;
}

export async function postSlackChannelMessage(input: {
  organizationId: string;
  channelId: string;
  text: string;
}): Promise<void> {
  const connector = await findSlackConnectorForOrganization(input.organizationId);
  const teamId = getSlackConnectorTeamId(connector);
  if (!teamId) {
    throw new Error("Slack is not connected for this organization.");
  }

  const chat = await getSlackChat();
  const adapter = chat.getAdapter("slack") as unknown as SlackOutboundAdapter;
  const installation = await adapter.getInstallation(teamId);
  if (!installation?.botToken) {
    throw new Error("Slack installation not found for this organization.");
  }

  const channelId = toCanonicalSlackChannelId(input.channelId);
  await adapter.withBotToken(
    installation.botToken,
    () => adapter.postChannelMessage(channelId, input.text),
    { installationId: teamId },
  );
}
