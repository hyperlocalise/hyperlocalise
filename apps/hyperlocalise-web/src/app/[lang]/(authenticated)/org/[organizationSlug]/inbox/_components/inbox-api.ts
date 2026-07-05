import type { createApiClient } from "@/lib/api-client";
import { readApiResponseError } from "@/lib/api-error";

import type { Conversation, ConversationMessage, LinkedJob } from "./inbox-types";

export type InboxGithubRepository = {
  archived: boolean;
  defaultBranch: string | null;
  enabled: boolean;
  fullName: string;
  githubRepositoryId: string;
  id: string;
  name: string;
  owner: string;
};

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
  sendMessage(
    organizationSlug: string,
    conversationId: string,
    input: SendConversationMessageInput,
  ): Promise<void>;
};

type ApiClient = ReturnType<typeof createApiClient>;

export function createInboxApi(client: ApiClient): InboxApi {
  const conversations = client.api.orgs[":organizationSlug"].conversations;

  return {
    async listConversations(organizationSlug, limit = 50) {
      const response = await conversations.$get({
        param: { organizationSlug },
        query: { limit: String(limit) },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load conversations");
      }
      const body = (await response.json()) as { conversations: Conversation[] };
      return body.conversations;
    },

    async listMessages(organizationSlug, conversationId) {
      const response = await conversations[":conversationId"].messages.$get({
        param: { organizationSlug, conversationId },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load messages");
      }
      const body = (await response.json()) as { messages: ConversationMessage[] };
      return body.messages;
    },

    async listLinkedJobs(organizationSlug, conversationId) {
      const response = await conversations[":conversationId"].jobs.$get({
        param: { organizationSlug, conversationId },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load jobs");
      }
      const body = (await response.json()) as { jobs: LinkedJob[] };
      return body.jobs;
    },

    async listGithubRepositories(organizationSlug) {
      const response = await client.api.orgs[":organizationSlug"]["github-installation"][
        "repositories"
      ].$get({
        param: { organizationSlug },
        query: {},
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load GitHub repositories");
      }
      const body = (await response.json()) as { repositories: InboxGithubRepository[] };
      return body.repositories.filter((repository) => repository.enabled && !repository.archived);
    },

    async sendMessage(organizationSlug, conversationId, input) {
      const formData = new FormData();
      formData.append("text", input.text);
      if (input.projectId) {
        formData.append("projectId", input.projectId);
      }
      if (input.repositoryFullName) {
        formData.append("repositoryFullName", input.repositoryFullName);
      }
      for (const file of input.files) {
        formData.append("files", file);
      }

      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to send message");
      }
    },
  };
}
