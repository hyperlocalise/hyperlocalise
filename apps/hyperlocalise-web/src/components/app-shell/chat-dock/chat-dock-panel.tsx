"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { observer } from "mobx-react-lite";
import { ArrowUpRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
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

import { ChatDockEmptyState } from "./chat-dock-empty-state";
import { chatDockMessages } from "./chat-dock.messages";
import { CHAT_DOCK_MAX_CONCURRENT_STREAMS } from "./chat-dock-persistence";
import type { ChatDockStore } from "./chat-dock-store";
import { getChatStreamManager } from "./chat-stream-manager";

const COLLAPSE_GLYPH = "−";
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
  const panelRef = useRef<HTMLElement>(null);

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
      if (!result.started && result.reason === "max_streams") {
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

  const streamedAssistant: StreamedAssistantMessage | null = (() => {
    const snapshot = store.getStreamSnapshot(tab.id);
    if (!snapshot) {
      return null;
    }

    return {
      conversationId: snapshot.conversationId,
      responseToMessageId: snapshot.responseToMessageId,
      message: snapshot.message,
      status: snapshot.status,
    };
  })();

  const isTabStreaming =
    streamManager.isStreaming(tab.id) || store.getStreamSnapshot(tab.id)?.status === "streaming";
  const isBusy =
    createConversationMutation.isPending || sendMessageMutation.isPending || isTabStreaming;

  return (
    <section
      ref={panelRef}
      className="fixed inset-x-2 bottom-[calc(var(--app-shell-plan-footer-height)+0.5rem)] z-50 flex h-[min(44rem,calc(100svh-var(--app-shell-plan-footer-height)-1rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/15 sm:inset-x-auto sm:right-3 sm:w-[30rem]"
      aria-label={tab.title}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
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
          <span aria-hidden className="text-base leading-none">
            {COLLAPSE_GLYPH}
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={intl.formatMessage(chatDockMessages.closeTab)}
          onClick={() => {
            store.closeTab(tab.id);
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
        </Button>
      </header>

      {tab.lastError ? (
        <div className="border-b border-border bg-destructive/5 px-3 py-2">
          <TypographyMuted className="text-xs text-destructive">{tab.lastError}</TypographyMuted>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab.isPending ? (
          <ChatDockEmptyState
            pageContext={store.pageContext}
            onSelectSuggestion={(prompt) => {
              store.setDraft(tab.id, prompt);
              requestAnimationFrame(() => {
                const textarea = panelRef.current?.querySelector("textarea");
                if (!textarea) {
                  return;
                }
                textarea.focus();
                const cursor = textarea.value.length;
                textarea.setSelectionRange(cursor, cursor);
              });
            }}
          />
        ) : (
          <ConversationMessageList
            conversationId={tab.id}
            currentUser={currentUser}
            isLoading={messagesQuery.isLoading}
            isStreaming={isTabStreaming}
            messages={messages as ConversationMessage[]}
            streamedAssistant={streamedAssistant}
          />
        )}

        <ReplyComposer
          key={tab.id}
          disabled={isBusy}
          draft={tab.draft}
          isStreaming={isTabStreaming}
          onDraftChange={(nextDraft) => store.setDraft(tab.id, nextDraft)}
          onSend={onSendMessage}
          organizationSlug={organizationSlug}
          placeholder={intl.formatMessage(chatDockMessages.emptyComposer)}
          variant="compact"
        />
      </div>
    </section>
  );
});
