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
import type { createApiClient } from "@/lib/api-client";
import { readApiResponseError } from "@/lib/api-error";
import type {
  GoSvcConversationApi,
  GoSvcConversationMessage,
} from "@/lib/go-svc/go-svc-conversation-api";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";

import type { ChatRepository, ChatRepositoryProvider } from "../../_components/chat-repository";
import {
  toChatRepositoryFromGithub,
  toChatRepositoryFromGitlab,
} from "../../_components/chat-repository";
import type { Conversation, ConversationMessage, LinkedJob } from "./inbox-types";

export type InboxChatRepository = ChatRepository;

export type ChatComposerSendOptions = {
  projectId?: string;
  repositoryFullName?: string;
  repositoryProvider?: ChatRepositoryProvider;
};

export type SendConversationMessageInput = {
  text: string;
  files: File[];
} & ChatComposerSendOptions;

export type InboxApi = {
  listConversations(organizationSlug: string, limit?: number): Promise<Conversation[]>;
  listMessages(organizationSlug: string, conversationId: string): Promise<ConversationMessage[]>;
  listLinkedJobs(organizationSlug: string, conversationId: string): Promise<LinkedJob[]>;
  listChatRepositories(organizationSlug: string): Promise<InboxChatRepository[]>;
  createConversation(
    organizationSlug: string,
    input: SendConversationMessageInput,
  ): Promise<{
    conversation: { id: string; title?: string };
    message?: { id: string; text: string };
  }>;
  sendMessage(
    organizationSlug: string,
    conversationId: string,
    input: SendConversationMessageInput,
  ): Promise<void>;
};

type ApiClient = ReturnType<typeof createApiClient>;

export type InboxConversationReads = Pick<
  GoSvcConversationApi,
  "list" | "listMessages" | "listJobs"
>;

const FILE_ONLY_CONVERSATION_TEXT = "Please translate the attached source file.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCreatedConversation(value: unknown): value is {
  conversation: { id: string; title?: string };
  message?: { id: string; text: string };
} {
  if (!isRecord(value) || !isRecord(value.conversation)) {
    return false;
  }
  return typeof value.conversation.id === "string";
}

function toConversationMessage(message: GoSvcConversationMessage): ConversationMessage {
  return {
    id: message.id,
    conversationId: message.interactionId,
    senderType: message.senderType,
    senderEmail: message.senderEmail,
    text: message.text,
    parts: Array.isArray(message.parts) ? message.parts : null,
    attachments: Array.isArray(message.attachments)
      ? (message.attachments as ConversationMessage["attachments"])
      : null,
    createdAt: message.createdAt,
  };
}

function conversationReadError(error: unknown, fallback: string): Error {
  if (error instanceof GoSvcClientError) {
    return new Error(goSvcErrorMessage(error, fallback), { cause: error });
  }
  return error instanceof Error ? error : new Error(fallback);
}

export function createInboxApi(
  client: ApiClient,
  conversationReads?: InboxConversationReads,
): InboxApi {
  const conversations = client.api.orgs[":organizationSlug"].conversations;

  return {
    async listConversations(organizationSlug, limit = 50) {
      if (!conversationReads) {
        throw new Error("Failed to load conversations");
      }
      try {
        const body = await conversationReads.list(organizationSlug, { limit });
        return body.conversations;
      } catch (error) {
        throw conversationReadError(error, "Failed to load conversations");
      }
    },

    async listMessages(organizationSlug, conversationId) {
      if (!conversationReads) {
        throw new Error("Failed to load messages");
      }
      try {
        const body = await conversationReads.listMessages(organizationSlug, conversationId);
        return body.messages.map(toConversationMessage);
      } catch (error) {
        throw conversationReadError(error, "Failed to load messages");
      }
    },

    async listLinkedJobs(organizationSlug, conversationId) {
      if (!conversationReads) {
        throw new Error("Failed to load jobs");
      }
      try {
        const body = await conversationReads.listJobs(organizationSlug, conversationId);
        return body.jobs;
      } catch (error) {
        throw conversationReadError(error, "Failed to load jobs");
      }
    },

    async listChatRepositories(organizationSlug) {
      const githubRequest = client.api.orgs[":organizationSlug"]["github-installation"][
        "repositories"
      ].$get({
        param: { organizationSlug },
        query: {},
      });
      const gitlabRequest = client.api.orgs[":organizationSlug"].gitlab.projects.$get({
        param: { organizationSlug },
      });
      const [githubResponse, gitlabResponse] = await Promise.all([githubRequest, gitlabRequest]);

      if (githubResponse.status !== 200 && gitlabResponse.status !== 200) {
        throw await readApiResponseError(githubResponse, "Failed to load repositories");
      }

      const repositories: InboxChatRepository[] = [];
      if (githubResponse.status === 200) {
        const body = await githubResponse.json();
        repositories.push(
          ...body.repositories
            .filter((repository) => repository.enabled && !repository.archived)
            .map(toChatRepositoryFromGithub),
        );
      }
      if (gitlabResponse.status === 200) {
        const body = await gitlabResponse.json();
        repositories.push(
          ...body.projects.filter((project) => !project.archived).map(toChatRepositoryFromGitlab),
        );
      }

      return repositories;
    },

    async createConversation(organizationSlug, input) {
      const response = await conversations.$post({
        param: { organizationSlug },
        form: {
          text: input.text.trim() || FILE_ONLY_CONVERSATION_TEXT,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.repositoryFullName ? { repositoryFullName: input.repositoryFullName } : {}),
          ...(input.repositoryProvider ? { repositoryProvider: input.repositoryProvider } : {}),
          ...(input.files.length > 0 ? { files: input.files } : {}),
        },
      } as never);
      if (response.status !== 201) {
        throw await readApiResponseError(response, "Failed to create conversation");
      }
      const body = await response.json();
      if (!isCreatedConversation(body)) {
        throw new Error("Failed to create conversation");
      }
      return body;
    },

    async sendMessage(organizationSlug, conversationId, input) {
      const response = await conversations[":conversationId"].messages.$post({
        param: { organizationSlug, conversationId },
        form: {
          text: input.text,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.repositoryFullName ? { repositoryFullName: input.repositoryFullName } : {}),
          ...(input.repositoryProvider ? { repositoryProvider: input.repositoryProvider } : {}),
          ...(input.files.length > 0 ? { files: input.files } : {}),
        },
      } as never);

      if (response.status !== 201) {
        throw await readApiResponseError(response, "Failed to send message");
      }
    },
  };
}
