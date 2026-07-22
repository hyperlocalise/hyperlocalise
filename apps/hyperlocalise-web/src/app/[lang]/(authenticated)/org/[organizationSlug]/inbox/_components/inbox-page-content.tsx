"use client";

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
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";

import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import { getChatStreamManager } from "@/components/app-shell/chat-dock/chat-stream-manager";
import { apiClient } from "@/lib/api-client-instance";

import { createInboxApi, type InboxApi } from "./inbox-api";
import { InboxPageView } from "./inbox-page-view";
import type { InboxCurrentUser, StreamedAssistantMessage } from "./inbox-types";

const inboxApi = createInboxApi(apiClient);

function conversationsQueryKey(organizationSlug: string) {
  return ["conversations", organizationSlug] as const;
}

function messagesQueryKey(conversationId: string) {
  return ["conversation-messages", conversationId] as const;
}

function jobsQueryKey(conversationId: string) {
  return ["conversation-jobs", conversationId] as const;
}

export const InboxPageContent = observer(function InboxPageContent({
  currentUser,
  organizationSlug,
  inboxApi: injectedInboxApi = inboxApi,
}: {
  currentUser: InboxCurrentUser;
  organizationSlug: string;
  inboxApi?: InboxApi;
}) {
  const router = useRouter();
  const params = useParams();
  const urlConversationId = params?.conversationId as string | undefined;
  const { chatDock } = useAppShellStore();
  const streamManager = getChatStreamManager(organizationSlug, chatDock);

  const conversationsQuery = useQuery({
    queryKey: conversationsQueryKey(organizationSlug),
    queryFn: () => injectedInboxApi.listConversations(organizationSlug),
  });

  const conversations = conversationsQuery.data ?? [];
  const selectedConversationId = urlConversationId ?? conversations[0]?.id ?? "";
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId],
  );

  const messagesQuery = useQuery({
    queryKey: messagesQueryKey(selectedConversationId),
    queryFn: () => injectedInboxApi.listMessages(organizationSlug, selectedConversationId),
    enabled: !!selectedConversationId,
  });

  const jobsQuery = useQuery({
    queryKey: jobsQueryKey(selectedConversationId),
    queryFn: () => injectedInboxApi.listLinkedJobs(organizationSlug, selectedConversationId),
    enabled: !!selectedConversationId,
  });

  const streamSnapshot = selectedConversationId
    ? streamManager.getSnapshot(selectedConversationId)
    : null;
  const isStreaming = Boolean(
    selectedConversationId &&
    (streamManager.isStreaming(selectedConversationId) || streamSnapshot?.status === "streaming"),
  );
  const streamedAssistant: StreamedAssistantMessage | null = streamSnapshot
    ? {
        conversationId: streamSnapshot.conversationId,
        responseToMessageId: streamSnapshot.responseToMessageId,
        message: streamSnapshot.message,
        status: streamSnapshot.status,
      }
    : null;

  const sendMessageMutation = useMutation({
    mutationFn: (input: {
      text: string;
      files: File[];
      projectId?: string;
      repositoryFullName?: string;
    }) => injectedInboxApi.sendMessage(organizationSlug, selectedConversationId, input),
    onSuccess: () => {
      void messagesQuery.refetch();
      void conversationsQuery.refetch();
    },
  });

  const mutateAsync = sendMessageMutation.mutateAsync;
  const onSendMessage = useCallback(
    async (
      text: string,
      files: File[],
      options?: { projectId?: string; repositoryFullName?: string },
    ) => {
      await mutateAsync({ text, files, ...options });
    },
    [mutateAsync],
  );

  const onSelectConversation = useCallback(
    (conversationId: string) => {
      router.push(`/org/${organizationSlug}/inbox/${conversationId}`);
    },
    [router, organizationSlug],
  );

  const messages = messagesQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const lastMessage = messages.at(-1);
  const isSparseInbox = !conversationsQuery.isLoading && conversations.length <= 1;

  useEffect(() => {
    if (
      !selectedConversationId ||
      !messagesQuery.isSuccess ||
      lastMessage?.senderType !== "user" ||
      !streamManager.shouldAutoTriggerResponse(selectedConversationId, lastMessage.id)
    ) {
      return;
    }

    void streamManager.start({
      conversationId: selectedConversationId,
      responseToMessageId: lastMessage.id,
      text: lastMessage.text,
    });
  }, [
    lastMessage?.id,
    lastMessage?.senderType,
    lastMessage?.text,
    messagesQuery.isSuccess,
    selectedConversationId,
    streamManager,
  ]);

  return (
    <InboxPageView
      conversations={conversations}
      conversationsIsError={conversationsQuery.isError}
      conversationsIsLoading={conversationsQuery.isLoading}
      currentUser={currentUser}
      isSending={sendMessageMutation.isPending}
      isSparseInbox={isSparseInbox}
      isStreaming={isStreaming}
      jobs={jobs}
      jobsIsLoading={jobsQuery.isLoading}
      messages={messages}
      messagesIsLoading={messagesQuery.isLoading}
      onSelectConversation={onSelectConversation}
      onSendMessage={onSendMessage}
      organizationSlug={organizationSlug}
      selectedConversation={selectedConversation}
      selectedConversationId={selectedConversationId}
      streamedAssistant={streamedAssistant}
    />
  );
});
