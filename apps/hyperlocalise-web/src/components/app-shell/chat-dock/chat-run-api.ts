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
import type { UIMessage } from "ai";

import type { createApiClient } from "@/lib/api-client";
import { readApiResponseError } from "@/lib/api-error";

type ApiClient = ReturnType<typeof createApiClient>;

export type ChatRunStatus = "running" | "completed" | "interrupted" | "failed";

/** The server's record of an agent turn, with the reply it has produced so far. */
export type ChatRunSnapshot = {
  id: string;
  userMessageId: string;
  status: ChatRunStatus;
  cancelRequested: boolean;
  parts: UIMessage["parts"];
};

export type ChatRunApi = {
  /** The conversation's latest turn, or null when it has none. */
  getRun(conversationId: string): Promise<ChatRunSnapshot | null>;
  /** Asks the running turn to stop. Resolves false when nothing was running. */
  cancelRun(conversationId: string): Promise<boolean>;
};

export function createChatRunApi(client: ApiClient, organizationSlug: string): ChatRunApi {
  const conversation = client.api.orgs[":organizationSlug"].conversations[":conversationId"];

  return {
    async getRun(conversationId) {
      const response = await conversation.chat.run.$get({
        param: { organizationSlug, conversationId },
      });
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load the reply");
      }
      const body = await response.json();
      if (!body.run) {
        return null;
      }
      return {
        id: body.run.id,
        userMessageId: body.run.userMessageId,
        status: body.run.status,
        cancelRequested: body.run.cancelRequested,
        parts: body.run.parts as UIMessage["parts"],
      };
    },

    async cancelRun(conversationId) {
      const response = await conversation.chat.run.cancel.$post({
        param: { organizationSlug, conversationId },
      });
      if (response.status === 404) {
        return false;
      }
      if (response.status !== 202) {
        throw await readApiResponseError(response, "Failed to stop the reply");
      }
      return true;
    },
  };
}

/** Loads the full result of a tool whose stored copy was shortened. */
export async function fetchFullToolOutput(
  client: ApiClient,
  input: {
    organizationSlug: string;
    conversationId: string;
    messageId: string;
    toolCallId: string;
  },
): Promise<unknown> {
  const response = await client.api.orgs[":organizationSlug"].conversations[
    ":conversationId"
  ].chat.messages[":messageId"]["tool-outputs"][":toolCallId"].$get({
    param: input,
  });
  if (response.status !== 200) {
    throw await readApiResponseError(response, "Failed to load the full tool result");
  }
  const body = await response.json();
  return body.toolOutput.output;
}
