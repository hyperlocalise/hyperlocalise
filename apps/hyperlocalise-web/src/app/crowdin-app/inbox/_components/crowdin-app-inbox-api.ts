/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  CROWDIN_EMBED_SESSION_HEADER,
  type CrowdinEmbedSessionPayload,
} from "@/lib/crowdin-app/embed-session";
import { readApiResponseError } from "@/lib/api-error";

import type {
  Conversation,
  ConversationMessage,
  LinkedJob,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/inbox-types";

export type CrowdinAppSessionResponse = {
  session: {
    embedToken: string;
    organizationSlug: string;
    organizationName: string;
    projectId: string;
    projectName: string;
    user: {
      id: string;
      email: string;
    };
  };
};

function authHeaders(embedToken: string): HeadersInit {
  return {
    [CROWDIN_EMBED_SESSION_HEADER]: embedToken,
  };
}

export async function bootstrapCrowdinAppSession(jwtToken: string) {
  const response = await fetch("/api/crowdin-app/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jwtToken }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "unauthorized");
  }

  return (await response.json()) as CrowdinAppSessionResponse;
}

export function createCrowdinAppInboxApi(embedToken: string) {
  return {
    async listConversations(organizationSlug: string, projectId: string, limit = 50) {
      const params = new URLSearchParams({
        limit: String(limit),
        projectId,
      });
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/conversations?${params}`,
        { headers: authHeaders(embedToken) },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load conversations");
      }
      const body = (await response.json()) as { conversations: Conversation[] };
      return body.conversations;
    },

    async listMessages(organizationSlug: string, conversationId: string) {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/conversations/${encodeURIComponent(conversationId)}/messages`,
        { headers: authHeaders(embedToken) },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load messages");
      }
      const body = (await response.json()) as { messages: ConversationMessage[] };
      return body.messages;
    },

    async listLinkedJobs(organizationSlug: string, conversationId: string) {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/conversations/${encodeURIComponent(conversationId)}/jobs`,
        { headers: authHeaders(embedToken) },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load jobs");
      }
      const body = (await response.json()) as { jobs: LinkedJob[] };
      return body.jobs;
    },

    async createConversation(
      organizationSlug: string,
      input: { text: string; files: File[]; projectId: string },
    ) {
      const formData = new FormData();
      formData.append("text", input.text);
      formData.append("projectId", input.projectId);
      for (const file of input.files) {
        formData.append("files", file);
      }

      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/conversations`,
        {
          method: "POST",
          headers: authHeaders(embedToken),
          body: formData,
        },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to create conversation");
      }
      return response.json() as Promise<{
        conversation: { id: string; title?: string };
        message?: { id: string; text: string };
      }>;
    },

    async sendMessage(
      organizationSlug: string,
      conversationId: string,
      input: { text: string; files: File[]; projectId: string },
    ) {
      const formData = new FormData();
      formData.append("text", input.text);
      formData.append("projectId", input.projectId);
      for (const file of input.files) {
        formData.append("files", file);
      }

      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: "POST",
          headers: authHeaders(embedToken),
          body: formData,
        },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to send message");
      }
    },
  };
}

export type CrowdinAppInboxApi = ReturnType<typeof createCrowdinAppInboxApi>;

export type { CrowdinEmbedSessionPayload };
