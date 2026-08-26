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

import type { GithubRepository } from "../../_components/github-repository";
import type { Conversation, ConversationMessage, LinkedJob } from "./inbox-types";

export type InboxGithubRepository = GithubRepository;

export type SendConversationMessageInput = {
  text: string;
  files: File[];
  projectId?: string;
  repositoryFullName?: string;
};

export type InboxApi = {
  listConversations(organizationSlug: string, limit?: number): Promise<Conversation[]>;
  listMessages(organizationSlug: string, conversationId: string): Promise<ConversationMessage[]>;
  listLinkedJobs(organizationSlug: string, conversationId: string): Promise<LinkedJob[]>;
  listGithubRepositories(organizationSlug: string): Promise<InboxGithubRepository[]>;
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

const FILE_ONLY_CONVERSATION_TEXT = "Please translate the attached source file.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isConversationMessages(value: unknown): value is ConversationMessage[] {
  return Array.isArray(value);
}

function isLinkedJobs(value: unknown): value is LinkedJob[] {
  return Array.isArray(value);
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

export function createInboxApi(client: ApiClient): InboxApi {
  const conversations = client.api.orgs[":organizationSlug"].conversations;

  return {
    async listConversations(organizationSlug, limit = 50) {
      const response = await conversations.$get({
        param: { organizationSlug },
        query: { limit: String(limit) },
      });
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load conversations");
      }
      const body = await response.json();
      return body.conversations;
    },

    async listMessages(organizationSlug, conversationId) {
      const response = await conversations[":conversationId"].messages.$get({
        param: { organizationSlug, conversationId },
      } as never);
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load messages");
      }
      const body = await response.json();
      if (!isRecord(body) || !isConversationMessages(body.messages)) {
        throw new Error("Failed to load messages");
      }
      return body.messages;
    },

    async listLinkedJobs(organizationSlug, conversationId) {
      const response = await conversations[":conversationId"].jobs.$get({
        param: { organizationSlug, conversationId },
      } as never);
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load jobs");
      }
      const body = await response.json();
      if (!isRecord(body) || !isLinkedJobs(body.jobs)) {
        throw new Error("Failed to load jobs");
      }
      return body.jobs;
    },

    async listGithubRepositories(organizationSlug) {
      const response = await client.api.orgs[":organizationSlug"]["github-installation"][
        "repositories"
      ].$get({
        param: { organizationSlug },
        query: {},
      });
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load GitHub repositories");
      }
      const body = await response.json();
      return body.repositories.filter((repository) => repository.enabled && !repository.archived);
    },

    async createConversation(organizationSlug, input) {
      const response = await conversations.$post({
        param: { organizationSlug },
        form: {
          text: input.text.trim() || FILE_ONLY_CONVERSATION_TEXT,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.repositoryFullName ? { repositoryFullName: input.repositoryFullName } : {}),
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
          ...(input.files.length > 0 ? { files: input.files } : {}),
        },
      } as never);

      if (response.status !== 201) {
        throw await readApiResponseError(response, "Failed to send message");
      }
    },
  };
}
