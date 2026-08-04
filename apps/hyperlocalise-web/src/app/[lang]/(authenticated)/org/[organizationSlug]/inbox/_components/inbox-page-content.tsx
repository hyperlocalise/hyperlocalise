"use client";

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
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";

import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import { getChatStreamManager } from "@/components/app-shell/chat-dock/chat-stream-manager";
import { apiClient } from "@/lib/api-client-instance";

import { createInboxApi, type InboxApi } from "./inbox-api";
import type { InboxSelection } from "./inbox-list";
import {
  createInboxNotificationsApi,
  notificationsQueryKey,
  notificationsUnreadCountQueryKey,
  type InboxNotificationsApi,
} from "./inbox-notifications-api";
import { InboxPageView } from "./inbox-page-view";
import type { InboxCurrentUser, StreamedAssistantMessage } from "./inbox-types";

const inboxApi = createInboxApi(apiClient);
const notificationsApi = createInboxNotificationsApi();

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
  notificationsApi: injectedNotificationsApi = notificationsApi,
}: {
  currentUser: InboxCurrentUser;
  organizationSlug: string;
  inboxApi?: InboxApi;
  notificationsApi?: InboxNotificationsApi;
}) {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const urlConversationId = params?.conversationId as string | undefined;
  const urlNotificationId = params?.notificationId as string | undefined;
  const { chatDock } = useAppShellStore();
  const streamManager = getChatStreamManager(organizationSlug, chatDock);

  const conversationsQuery = useQuery({
    queryKey: conversationsQueryKey(organizationSlug),
    queryFn: () => injectedInboxApi.listConversations(organizationSlug),
  });

  const notificationsQuery = useQuery({
    queryKey: notificationsQueryKey(organizationSlug),
    queryFn: async () => {
      const result = await injectedNotificationsApi.list(organizationSlug, { limit: 50 });
      return result.notifications;
    },
  });

  const unreadCountQuery = useQuery({
    queryKey: notificationsUnreadCountQueryKey(organizationSlug),
    queryFn: () => injectedNotificationsApi.unreadCount(organizationSlug),
    refetchInterval: 45_000,
  });

  const conversations = conversationsQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];

  const selection: InboxSelection = useMemo(() => {
    if (urlNotificationId) {
      return { kind: "notification", id: urlNotificationId };
    }
    if (urlConversationId) {
      return { kind: "conversation", id: urlConversationId };
    }
    if (conversations[0]) {
      return { kind: "conversation", id: conversations[0].id };
    }
    if (notifications[0]) {
      return { kind: "notification", id: notifications[0].id };
    }
    return null;
  }, [conversations, notifications, urlConversationId, urlNotificationId]);

  const selectedConversationId = selection?.kind === "conversation" ? selection.id : "";
  const selectedNotificationId = selection?.kind === "notification" ? selection.id : "";

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId],
  );
  const selectedNotification = useMemo(
    () => notifications.find((notification) => notification.id === selectedNotificationId),
    [notifications, selectedNotificationId],
  );

  const messagesQuery = useQuery({
    queryKey: messagesQueryKey(selectedConversationId),
    queryFn: () => injectedInboxApi.listMessages(organizationSlug, selectedConversationId),
    enabled: selection?.kind === "conversation" && !!selectedConversationId,
  });

  const jobsQuery = useQuery({
    queryKey: jobsQueryKey(selectedConversationId),
    queryFn: () => injectedInboxApi.listLinkedJobs(organizationSlug, selectedConversationId),
    enabled: selection?.kind === "conversation" && !!selectedConversationId,
  });

  const streamSnapshot =
    selection?.kind === "conversation" && selectedConversationId
      ? streamManager.getSnapshot(selectedConversationId)
      : null;
  const isStreaming = Boolean(
    selection?.kind === "conversation" &&
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

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      injectedNotificationsApi.markRead(organizationSlug, notificationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notificationsQueryKey(organizationSlug) }),
        queryClient.invalidateQueries({
          queryKey: notificationsUnreadCountQueryKey(organizationSlug),
        }),
      ]);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => injectedNotificationsApi.markAllRead(organizationSlug),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notificationsQueryKey(organizationSlug) }),
        queryClient.invalidateQueries({
          queryKey: notificationsUnreadCountQueryKey(organizationSlug),
        }),
      ]);
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

  const onSelectNotification = useCallback(
    (notificationId: string) => {
      router.push(`/org/${organizationSlug}/inbox/notifications/${notificationId}`);
      const notification = notifications.find((item) => item.id === notificationId);
      if (notification && !notification.readAt) {
        markReadMutation.mutate(notificationId);
      }
    },
    [router, organizationSlug, notifications, markReadMutation],
  );

  const onMarkAllRead = useCallback(() => {
    markAllReadMutation.mutate();
  }, [markAllReadMutation]);

  const messages = messagesQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const lastMessage = messages.at(-1);
  const isSparseInbox =
    !conversationsQuery.isLoading &&
    !notificationsQuery.isLoading &&
    conversations.length + notifications.length <= 1;

  useEffect(() => {
    if (
      selection?.kind !== "conversation" ||
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
    selection?.kind,
    streamManager,
  ]);

  useEffect(() => {
    if (
      urlNotificationId &&
      selectedNotification &&
      !selectedNotification.readAt &&
      !markReadMutation.isPending
    ) {
      markReadMutation.mutate(urlNotificationId);
    }
  }, [urlNotificationId, selectedNotification, markReadMutation]);

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
      notifications={notifications}
      notificationsIsError={notificationsQuery.isError}
      notificationsIsLoading={notificationsQuery.isLoading}
      onMarkAllRead={onMarkAllRead}
      onSelectConversation={onSelectConversation}
      onSelectNotification={onSelectNotification}
      onSendMessage={onSendMessage}
      organizationSlug={organizationSlug}
      selectedConversation={selectedConversation}
      selectedNotification={selectedNotification}
      selection={selection}
      streamedAssistant={streamedAssistant}
      unreadNotificationCount={unreadCountQuery.data ?? 0}
    />
  );
});
