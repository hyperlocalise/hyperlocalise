"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";

import { createInboxApi } from "./inbox-api";
import { InboxPageView } from "./inbox-page-view";
import type { InboxCurrentUser } from "./inbox-types";
import { useConversationStream } from "./use-conversation-stream";

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

export function InboxPageContent({
  currentUser,
  organizationSlug,
  inboxApi: injectedInboxApi = inboxApi,
}: {
  currentUser: InboxCurrentUser;
  organizationSlug: string;
  inboxApi?: typeof inboxApi;
}) {
  const router = useRouter();
  const params = useParams();
  const urlConversationId = params?.conversationId as string | undefined;

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

  const refetchConversations = conversationsQuery.refetch;
  const onStreamFinished = useCallback(() => {
    void refetchConversations();
  }, [refetchConversations]);

  const { isStreaming, startStreaming, streamedAssistant } = useConversationStream({
    organizationSlug,
    onStreamFinished,
  });

  const sendMessageMutation = useMutation({
    mutationFn: (input: { text: string; files: File[]; projectId?: string }) =>
      injectedInboxApi.sendMessage(organizationSlug, selectedConversationId, input),
    onSuccess: () => {
      void messagesQuery.refetch();
      void conversationsQuery.refetch();
    },
  });

  const mutateAsync = sendMessageMutation.mutateAsync;
  const onSendMessage = useCallback(
    async (text: string, files: File[], projectId?: string) => {
      await mutateAsync({ text, files, projectId });
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

  const autoTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      selectedConversationId &&
      messagesQuery.isSuccess &&
      lastMessage?.senderType === "user" &&
      !isStreaming &&
      autoTriggeredRef.current !== lastMessage.id
    ) {
      autoTriggeredRef.current = lastMessage.id;
      void startStreaming({
        conversationId: selectedConversationId,
        responseToMessageId: lastMessage.id,
        text: lastMessage.text,
      });
    }
  }, [
    isStreaming,
    lastMessage?.id,
    lastMessage?.senderType,
    lastMessage?.text,
    messagesQuery.isSuccess,
    selectedConversationId,
    startStreaming,
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
}
