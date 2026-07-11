"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { observer } from "mobx-react-lite";
import { ArrowDown01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { ConversationMessageList } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/conversation-message-list";
import { createInboxApi } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/inbox-api";
import type {
  Conversation,
  ConversationMessage,
  InboxCurrentUser,
  StreamedAssistantMessage,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/inbox-types";
import { ReplyComposer } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/reply-composer";
import { Button } from "@/components/ui/button";
import { TypographyMuted } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";

import { chatDockMessages } from "./chat-dock.messages";
import {
  CHAT_DOCK_MAX_CONCURRENT_STREAMS,
  CHAT_DOCK_PANEL_HEIGHT_PX,
} from "./chat-dock-persistence";
import type { ChatDockStore } from "./chat-dock-store";
import { getChatStreamManager } from "./chat-stream-manager";

const inboxApi = createInboxApi(apiClient);

function messagesQueryKey(conversationId: string) {
  return ["conversation-messages", conversationId] as const;
}

function conversationsQueryKey(organizationSlug: string) {
  return ["conversations", organizationSlug] as const;
}

function buildPlaceholderConversation(tab: {
  id: string;
  title: string;
  isPending: boolean;
}): Conversation {
  const now = new Date().toISOString();
  return {
    id: tab.id,
    title: tab.title,
    source: "chat_ui",
    status: "active",
    projectId: null,
    lastMessageAt: now,
    createdAt: now,
    participantEmail: null,
    lastMessage: null,
  };
}

export const ChatDockPanel = observer(function ChatDockPanel({
  organizationSlug,
  currentUser,
  store,
}: {
  organizationSlug: string;
  currentUser: InboxCurrentUser;
  store: ChatDockStore;
}) {
  const intl = useIntl();
  const tab = store.activeTab;
  const queryClient = useQueryClient();
  const streamManager = getChatStreamManager(organizationSlug, store);
  const autoTriggeredRef = useRef<string | null>(null);

  const conversationId = tab && !tab.isPending ? tab.id : "";

  const conversationsQuery = useQuery({
    queryKey: conversationsQueryKey(organizationSlug),
    queryFn: () => inboxApi.listConversations(organizationSlug),
  });

  const messagesQuery = useQuery({
    queryKey: messagesQueryKey(conversationId),
    queryFn: () => inboxApi.listMessages(organizationSlug, conversationId),
    enabled: Boolean(conversationId),
    retry: false,
  });

  useEffect(() => {
    if (!messagesQuery.isError || !tab || tab.isPending) {
      return;
    }

    const message =
      messagesQuery.error instanceof Error
        ? messagesQuery.error.message
        : intl.formatMessage(chatDockMessages.conversationMissing);

    if (/not found|404/i.test(message)) {
      toast.error(intl.formatMessage(chatDockMessages.conversationMissing));
      store.closeTab(tab.id);
    }
  }, [intl, messagesQuery.error, messagesQuery.isError, store, tab]);

  const conversation =
    conversationsQuery.data?.find((entry) => entry.id === conversationId) ??
    (tab ? buildPlaceholderConversation(tab) : undefined);

  useEffect(() => {
    if (conversation && tab && !tab.isPending && conversation.title !== tab.title) {
      store.setTitle(tab.id, conversation.title);
    }
  }, [conversation, store, tab]);

  const startStreamForMessage = useCallback(
    async (input: { conversationId: string; responseToMessageId: string; text: string }) => {
      const result = await streamManager.start(input);
      if (!result.started && result.reason) {
        toast.error(
          intl.formatMessage(chatDockMessages.maxStreams, {
            count: CHAT_DOCK_MAX_CONCURRENT_STREAMS,
          }),
        );
      }
    },
    [intl, streamManager],
  );

  const messages = messagesQuery.data ?? [];
  const lastMessage = messages.at(-1);

  useEffect(() => {
    if (
      !conversationId ||
      !messagesQuery.isSuccess ||
      lastMessage?.senderType !== "user" ||
      streamManager.isStreaming(conversationId) ||
      autoTriggeredRef.current === lastMessage.id
    ) {
      return;
    }

    autoTriggeredRef.current = lastMessage.id;
    void startStreamForMessage({
      conversationId,
      responseToMessageId: lastMessage.id,
      text: lastMessage.text,
    });
  }, [
    conversationId,
    lastMessage?.id,
    lastMessage?.senderType,
    lastMessage?.text,
    messagesQuery.isSuccess,
    startStreamForMessage,
    streamManager,
  ]);

  const createConversationMutation = useMutation({
    mutationFn: async (input: { text: string; files: File[]; repositoryFullName?: string }) => {
      const formData = new FormData();
      formData.set("text", input.text.trim() || "Please translate the attached source file.");
      if (input.repositoryFullName) {
        formData.set("repositoryFullName", input.repositoryFullName);
      }
      for (const file of input.files) {
        formData.append("files", file);
      }

      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/conversations`,
        {
          method: "POST",
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
  });

  const sendMessageMutation = useMutation({
    mutationFn: (input: {
      text: string;
      files: File[];
      projectId?: string;
      repositoryFullName?: string;
    }) => inboxApi.sendMessage(organizationSlug, conversationId, input),
  });

  const onSendMessage = useCallback(
    async (
      text: string,
      files: File[],
      options?: { projectId?: string; repositoryFullName?: string },
    ) => {
      if (!tab) {
        return;
      }

      if (tab.isPending) {
        const pendingId = tab.id;
        try {
          store.setLastError(pendingId, null);
          const result = await createConversationMutation.mutateAsync({
            text,
            files,
            repositoryFullName: options?.repositoryFullName,
          });
          store.setDraft(pendingId, "");
          const title = text.trim().slice(0, 48) || result.conversation.title || "Chat";
          store.promotePendingTab(pendingId, result.conversation.id, title);
          await queryClient.invalidateQueries({
            queryKey: conversationsQueryKey(organizationSlug),
          });
          await queryClient.invalidateQueries({
            queryKey: messagesQueryKey(result.conversation.id),
          });
        } catch (error) {
          console.error(error);
          store.setLastError(pendingId, intl.formatMessage(chatDockMessages.createFailed));
          toast.error(intl.formatMessage(chatDockMessages.createFailed));
          throw error;
        }
        return;
      }

      try {
        store.setLastError(tab.id, null);
        await sendMessageMutation.mutateAsync({ text, files, ...options });
        store.setDraft(tab.id, "");
        await queryClient.invalidateQueries({ queryKey: messagesQueryKey(tab.id) });
        await queryClient.invalidateQueries({
          queryKey: conversationsQueryKey(organizationSlug),
        });
      } catch (error) {
        console.error(error);
        store.setLastError(tab.id, intl.formatMessage(chatDockMessages.sendFailed));
        toast.error(intl.formatMessage(chatDockMessages.sendFailed));
        throw error;
      }
    },
    [
      createConversationMutation,
      intl,
      organizationSlug,
      queryClient,
      sendMessageMutation,
      store,
      tab,
    ],
  );

  if (!tab) {
    return null;
  }

  const streamedAssistant: StreamedAssistantMessage | null = tab.streamSnapshot
    ? {
        conversationId: tab.streamSnapshot.conversationId,
        responseToMessageId: tab.streamSnapshot.responseToMessageId,
        message: tab.streamSnapshot.message,
        status: tab.streamSnapshot.status,
      }
    : null;

  const isBusy =
    createConversationMutation.isPending ||
    sendMessageMutation.isPending ||
    tab.isStreaming ||
    streamManager.isStreaming(tab.id);

  return (
    <section
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: CHAT_DOCK_PANEL_HEIGHT_PX }}
      aria-label={tab.title}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{tab.title}</p>
        </div>
        {!tab.isPending ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            render={<Link href={`/org/${organizationSlug}/inbox/${tab.id}`} />}
          >
            <FormattedMessage {...chatDockMessages.openInInbox} />
            <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} className="size-3.5" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={intl.formatMessage(chatDockMessages.collapsePanel)}
          onClick={() => store.setPanelOpen(false)}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3.5" />
        </Button>
      </header>

      {tab.lastError ? (
        <div className="border-b border-border bg-destructive/5 px-3 py-2">
          <TypographyMuted className="text-xs text-destructive">{tab.lastError}</TypographyMuted>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab.isPending ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-4">
            <TypographyMuted className="text-center text-sm">
              <FormattedMessage {...chatDockMessages.emptyComposer} />
            </TypographyMuted>
          </div>
        ) : (
          <ConversationMessageList
            conversationId={tab.id}
            currentUser={currentUser}
            isLoading={messagesQuery.isLoading}
            isStreaming={tab.isStreaming}
            messages={messages as ConversationMessage[]}
            streamedAssistant={streamedAssistant}
          />
        )}

        <ReplyComposer
          key={tab.id}
          disabled={isBusy}
          draft={tab.draft}
          isStreaming={tab.isStreaming}
          onDraftChange={(nextDraft) => store.setDraft(tab.id, nextDraft)}
          onSend={onSendMessage}
          organizationSlug={organizationSlug}
        />
      </div>
    </section>
  );
});
