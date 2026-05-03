"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/utils";

import { ConversationPanel } from "./conversation-panel";
import { InboxList } from "./inbox-list";
import type { Conversation, ConversationMessage, InboxCurrentUser, LinkedJob } from "./inbox-types";
import { useConversationStream } from "./use-conversation-stream";

export function InboxPageContent({
  currentUser,
  organizationSlug,
}: {
  currentUser: InboxCurrentUser;
  organizationSlug: string;
}) {
  const router = useRouter();
  const params = useParams();
  const urlConversationId = params?.conversationId as string | undefined;

  const conversationsQuery = useQuery({
    queryKey: ["conversations", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].conversations.$get({
        param: { organizationSlug },
        query: { limit: "50" },
      });

      if (!response.ok) throw new Error("Failed to load conversations");
      return (await response.json()) as { conversations: Conversation[] };
    },
  });

  const conversations = conversationsQuery.data?.conversations ?? [];
  const selectedConversationId = urlConversationId ?? conversations[0]?.id ?? "";
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );

  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return { messages: [] as ConversationMessage[] };

      const response = await apiClient.api.orgs[":organizationSlug"].conversations[
        ":conversationId"
      ].messages.$get({
        param: { organizationSlug, conversationId: selectedConversationId },
      });

      if (!response.ok) throw new Error("Failed to load messages");
      return (await response.json()) as { messages: ConversationMessage[] };
    },
    enabled: !!selectedConversationId,
  });

  const jobsQuery = useQuery({
    queryKey: ["conversation-jobs", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return { jobs: [] as LinkedJob[] };

      const response = await apiClient.api.orgs[":organizationSlug"].conversations[
        ":conversationId"
      ].jobs.$get({
        param: { organizationSlug, conversationId: selectedConversationId },
      });

      if (!response.ok) throw new Error("Failed to load jobs");
      return (await response.json()) as { jobs: LinkedJob[] };
    },
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
    mutationFn: async (text: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].conversations[
        ":conversationId"
      ].messages.$post({
        param: { organizationSlug, conversationId: selectedConversationId },
        json: { text },
      });

      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: () => {
      void messagesQuery.refetch();
      void conversationsQuery.refetch();
    },
  });

  const messages = messagesQuery.data?.messages ?? [];
  const jobs = jobsQuery.data?.jobs ?? [];
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
      void startStreaming(selectedConversationId, lastMessage.id);
    }
  }, [
    isStreaming,
    lastMessage?.id,
    lastMessage?.senderType,
    messagesQuery.isSuccess,
    selectedConversationId,
    startStreaming,
  ]);

  return (
    <main
      data-organization={organizationSlug}
      className="-mx-4 -my-5 min-h-[calc(100svh-3.5rem)] overflow-hidden bg-app-shell-background text-foreground sm:-mx-6 lg:-mx-8"
    >
      <div
        className={cn(
          "grid min-h-[calc(100svh-3.5rem)] grid-cols-1",
          isSparseInbox
            ? "lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)]"
            : "lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)]",
        )}
      >
        <InboxList
          conversations={conversations}
          isError={conversationsQuery.isError}
          isLoading={conversationsQuery.isLoading}
          onSelectConversation={(conversationId) =>
            router.push(`/org/${organizationSlug}/inbox/${conversationId}`)
          }
          selectedConversationId={selectedConversationId}
        />

        <ConversationPanel
          conversation={selectedConversation}
          currentUser={currentUser}
          isSending={sendMessageMutation.isPending}
          isStreaming={isStreaming}
          jobs={jobs}
          jobsIsLoading={jobsQuery.isLoading}
          messages={messages}
          messagesIsLoading={messagesQuery.isLoading}
          onSendMessage={(text) => sendMessageMutation.mutate(text)}
          organizationSlug={organizationSlug}
          streamedAssistant={streamedAssistant}
        />
      </div>
    </main>
  );
}
