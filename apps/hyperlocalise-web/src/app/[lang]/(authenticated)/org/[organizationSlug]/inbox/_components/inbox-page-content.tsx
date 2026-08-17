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
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import { getChatStreamManager } from "@/components/app-shell/chat-dock/chat-stream-manager";
import { isInboxNewRequestPath } from "@/components/app-shell/navigation-config";
import { apiClient } from "@/lib/api-client-instance";

import { createInboxApi, type InboxApi } from "./inbox-api";
import { conversationPanelMessages } from "./conversation-panel.messages";
import { resolveInboxSelection, type InboxSelection } from "./inbox-list";
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

const NOTIFICATIONS_PAGE_SIZE = 50;

function conversationsQueryKey(organizationSlug: string) {
  return ["conversations", organizationSlug] as const;
}

function messagesQueryKey(conversationId: string) {
  return ["conversation-messages", conversationId] as const;
}

function jobsQueryKey(conversationId: string) {
  return ["conversation-jobs", conversationId] as const;
}

function notificationDetailQueryKey(organizationSlug: string, notificationId: string) {
  return ["issue-notification", organizationSlug, notificationId] as const;
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
  const pathname = usePathname();
  const params = useParams();
  const intl = useIntl();
  const queryClient = useQueryClient();
  const urlConversationId = params?.conversationId as string | undefined;
  const urlNotificationId = params?.notificationId as string | undefined;
  const composeNew = isInboxNewRequestPath(pathname);
  const [composeDraft, setComposeDraft] = useState("");
  const { chatDock } = useAppShellStore();
  const streamManager = getChatStreamManager(organizationSlug, chatDock);

  const conversationsQuery = useQuery({
    queryKey: conversationsQueryKey(organizationSlug),
    queryFn: () => injectedInboxApi.listConversations(organizationSlug),
  });

  const notificationsQuery = useInfiniteQuery({
    queryKey: notificationsQueryKey(organizationSlug),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const result = await injectedNotificationsApi.list(organizationSlug, {
        limit: NOTIFICATIONS_PAGE_SIZE,
        offset: pageParam,
      });
      return result;
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.notifications.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const unreadCountQuery = useQuery({
    queryKey: notificationsUnreadCountQueryKey(organizationSlug),
    queryFn: () => injectedNotificationsApi.unreadCount(organizationSlug),
    refetchInterval: 45_000,
  });

  const conversations = conversationsQuery.data ?? [];
  const notifications = useMemo(
    () => notificationsQuery.data?.pages.flatMap((page) => page.notifications) ?? [],
    [notificationsQuery.data?.pages],
  );
  const notificationsTotal = notificationsQuery.data?.pages[0]?.total ?? notifications.length;

  const selection: InboxSelection = useMemo(
    () =>
      resolveInboxSelection({
        composeNew,
        urlConversationId,
        urlNotificationId,
        firstConversationId: conversations[0]?.id,
        firstNotificationId: notifications[0]?.id,
      }),
    [composeNew, conversations, notifications, urlConversationId, urlNotificationId],
  );

  const selectedConversationId = selection?.kind === "conversation" ? selection.id : "";
  const selectedNotificationId = selection?.kind === "notification" ? selection.id : "";

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId],
  );
  const selectedNotificationFromList = useMemo(
    () => notifications.find((notification) => notification.id === selectedNotificationId),
    [notifications, selectedNotificationId],
  );
  const selectedNotificationQuery = useQuery({
    queryKey: notificationDetailQueryKey(organizationSlug, selectedNotificationId),
    queryFn: () => injectedNotificationsApi.getById(organizationSlug, selectedNotificationId),
    enabled:
      selection?.kind === "notification" &&
      !!selectedNotificationId &&
      !selectedNotificationFromList,
  });
  const selectedNotification = selectedNotificationFromList ?? selectedNotificationQuery.data;

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

  const createConversationMutation = useMutation({
    mutationFn: (input: {
      text: string;
      files: File[];
      projectId?: string;
      repositoryFullName?: string;
    }) => injectedInboxApi.createConversation(organizationSlug, input),
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
        queryClient.invalidateQueries({
          queryKey: ["issue-notification", organizationSlug],
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
        queryClient.invalidateQueries({
          queryKey: ["issue-notification", organizationSlug],
        }),
      ]);
    },
  });

  const mutateAsync = sendMessageMutation.mutateAsync;
  const createConversationAsync = createConversationMutation.mutateAsync;
  const onSendMessage = useCallback(
    async (
      text: string,
      files: File[],
      options?: { projectId?: string; repositoryFullName?: string },
    ) => {
      if (composeNew) {
        try {
          const result = await createConversationAsync({ text, files, ...options });
          setComposeDraft("");
          await queryClient.invalidateQueries({
            queryKey: conversationsQueryKey(organizationSlug),
          });
          router.push(`/org/${organizationSlug}/inbox/${result.conversation.id}`);
        } catch (error) {
          toast.error(intl.formatMessage(conversationPanelMessages.createFailed));
          throw error;
        }
        return;
      }

      await mutateAsync({ text, files, ...options });
    },
    [
      composeNew,
      createConversationAsync,
      intl,
      mutateAsync,
      organizationSlug,
      queryClient,
      router,
    ],
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

  const onLoadMoreNotifications = useCallback(() => {
    void notificationsQuery.fetchNextPage();
  }, [notificationsQuery]);

  const messages = messagesQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const lastMessage = messages.at(-1);
  const isSparseInbox =
    !conversationsQuery.isLoading &&
    !notificationsQuery.isLoading &&
    conversations.length + notifications.length <= 1;
  const hasMoreNotifications =
    notifications.length < notificationsTotal && notificationsQuery.hasNextPage;

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
      draft={composeDraft}
      hasMoreNotifications={hasMoreNotifications}
      isLoadingMoreNotifications={notificationsQuery.isFetchingNextPage}
      isSending={sendMessageMutation.isPending || createConversationMutation.isPending}
      isSparseInbox={isSparseInbox}
      isStreaming={isStreaming}
      jobs={jobs}
      jobsIsLoading={jobsQuery.isLoading}
      messages={messages}
      messagesIsLoading={messagesQuery.isLoading}
      notifications={notifications}
      notificationsIsError={notificationsQuery.isError}
      notificationsIsLoading={notificationsQuery.isLoading}
      onDraftChange={setComposeDraft}
      onLoadMoreNotifications={onLoadMoreNotifications}
      onMarkAllRead={onMarkAllRead}
      onSelectConversation={onSelectConversation}
      onSelectNotification={onSelectNotification}
      onSendMessage={onSendMessage}
      organizationSlug={organizationSlug}
      selectedConversation={selectedConversation}
      selectedNotification={selectedNotification}
      selectedNotificationIsLoading={
        selection?.kind === "notification" &&
        !selectedNotification &&
        (selectedNotificationQuery.isLoading || selectedNotificationQuery.isFetching)
      }
      selection={selection}
      streamedAssistant={streamedAssistant}
      unreadNotificationCount={unreadCountQuery.data ?? 0}
    />
  );
});
