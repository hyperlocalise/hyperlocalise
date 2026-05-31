"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

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
  // Memoize selected conversation to prevent re-calculating on every stream chunk
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId],
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
    mutationFn: async ({ text, files }: { text: string; files: File[] }) => {
      const formData = new FormData();
      formData.append("text", text);
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/conversations/${encodeURIComponent(selectedConversationId)}/messages`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: () => {
      void messagesQuery.refetch();
      void conversationsQuery.refetch();
    },
  });

  const mutateAsync = sendMessageMutation.mutateAsync;
  // Stabilize callbacks to prevent unnecessary re-renders of memoized child components
  const onSendMessage = useCallback(
    (text: string, files: File[]) => mutateAsync({ text, files }),
    [mutateAsync],
  );

  const onSelectConversation = useCallback(
    (conversationId: string) => {
      router.push(`/org/${organizationSlug}/inbox/${conversationId}`);
    },
    [router, organizationSlug],
  );

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
      className="-mx-4 -my-5 min-h-[calc(100svh-3.5rem)] overflow-hidden bg-background text-foreground sm:-mx-6 lg:-mx-8"
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
          onSelectConversation={onSelectConversation}
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
          onSendMessage={onSendMessage}
          organizationSlug={organizationSlug}
          streamedAssistant={streamedAssistant}
        />
      </div>
    </main>
  );
}
