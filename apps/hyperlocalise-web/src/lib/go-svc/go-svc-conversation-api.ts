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
import type { GoSvcRequestOptions } from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export type GoSvcConversationListQuery = {
  status?: "active" | "archived";
  projectId?: string;
  limit?: number;
  cursor?: string;
};

export type GoSvcConversationLastMessage = {
  text: string;
  senderType: "user" | "agent";
  createdAt: string;
};

export type GoSvcConversationSummary = {
  id: string;
  title: string;
  source:
    | "chat_ui"
    | "email_agent"
    | "github_agent"
    | "slack_agent"
    | "web_chat"
    | "workflow_approval";
  status: "active" | "archived";
  projectId: string | null;
  lastMessageAt: string;
  createdAt: string;
  participantEmail: string | null;
  lastMessage: GoSvcConversationLastMessage | null;
};

export type GoSvcConversationDetail = {
  id: string;
  organizationId: string;
  projectId: string | null;
  source: GoSvcConversationSummary["source"];
  title: string;
  sourceThreadId: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  status: GoSvcConversationSummary["status"];
};

export type GoSvcConversationMessage = {
  id: string;
  interactionId: string;
  senderType: "user" | "agent";
  senderEmail: string | null;
  text: string;
  parts: unknown;
  attachments: unknown;
  createdAt: string;
};

export type GoSvcConversationJob = {
  id: string;
  projectId: string | null;
  kind: "translation" | "research" | "review" | "proofread" | "sync" | "asset_management";
  type: "string" | "file" | null;
  status: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  outcomeKind: "string_result" | "file_result" | "error" | null;
  createdAt: string;
  completedAt: string | null;
};

export class GoSvcConversationApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(
    organizationSlug: string,
    query: GoSvcConversationListQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ conversations: GoSvcConversationSummary[] }>(
      orgPath(organizationSlug, "conversations"),
      { query, ...options },
    );
  }

  get(organizationSlug: string, conversationId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{
      conversation: GoSvcConversationDetail;
      messages: GoSvcConversationMessage[];
    }>(orgPath(organizationSlug, "conversations", conversationId), options);
  }

  listMessages(
    organizationSlug: string,
    conversationId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ messages: GoSvcConversationMessage[] }>(
      orgPath(organizationSlug, "conversations", conversationId, "messages"),
      options,
    );
  }

  listJobs(organizationSlug: string, conversationId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ jobs: GoSvcConversationJob[] }>(
      orgPath(organizationSlug, "conversations", conversationId, "jobs"),
      options,
    );
  }
}
