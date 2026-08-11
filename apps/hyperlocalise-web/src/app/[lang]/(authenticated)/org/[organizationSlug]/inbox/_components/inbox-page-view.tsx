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
import { FormattedMessage } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { ConversationPanel } from "./conversation-panel";
import { InboxIssuePanel } from "./inbox-issue-panel";
import { InboxList, type InboxSelection } from "./inbox-list";
import { InboxPanelErrorBoundary } from "./inbox-panel-error-boundary";
import type { InboxIssueNotification } from "./inbox-notifications-api";
import { inboxNotificationsMessages } from "./inbox-notifications.messages";
import type {
  Conversation,
  ConversationMessage,
  InboxCurrentUser,
  LinkedJob,
  StreamedAssistantMessage,
} from "./inbox-types";

export function InboxPageView({
  conversations,
  conversationsIsError,
  conversationsIsLoading,
  currentUser,
  hasMoreNotifications,
  isLoadingMoreNotifications,
  isSending,
  isSparseInbox,
  isStreaming,
  jobs,
  jobsIsLoading,
  messages,
  messagesIsLoading,
  notifications,
  notificationsIsError,
  notificationsIsLoading,
  onLoadMoreNotifications,
  onMarkAllRead,
  onSelectConversation,
  onSelectNotification,
  onSendMessage,
  organizationSlug,
  selectedConversation,
  selectedNotification,
  selectedNotificationIsLoading,
  selection,
  streamedAssistant,
  unreadNotificationCount,
}: {
  conversations: Conversation[];
  conversationsIsError: boolean;
  conversationsIsLoading: boolean;
  currentUser: InboxCurrentUser;
  hasMoreNotifications: boolean;
  isLoadingMoreNotifications: boolean;
  isSending: boolean;
  isSparseInbox: boolean;
  isStreaming: boolean;
  jobs: LinkedJob[];
  jobsIsLoading: boolean;
  messages: ConversationMessage[];
  messagesIsLoading: boolean;
  notifications: InboxIssueNotification[];
  notificationsIsError: boolean;
  notificationsIsLoading: boolean;
  onLoadMoreNotifications: () => void;
  onMarkAllRead: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSelectNotification: (notificationId: string) => void;
  onSendMessage: (
    text: string,
    files: File[],
    options?: { projectId?: string; repositoryFullName?: string },
  ) => void | Promise<void>;
  organizationSlug: string;
  selectedConversation: Conversation | undefined;
  selectedNotification: InboxIssueNotification | undefined;
  selectedNotificationIsLoading: boolean;
  selection: InboxSelection;
  streamedAssistant: StreamedAssistantMessage | null;
  unreadNotificationCount: number;
}) {
  const listIsLoading = conversationsIsLoading || notificationsIsLoading;
  const listIsError = conversationsIsError || notificationsIsError;
  const selectionKey =
    selection?.kind === "conversation"
      ? `conversation:${selection.id}`
      : selection?.kind === "notification"
        ? `notification:${selection.id}`
        : "none";

  return (
    <main
      data-organization={organizationSlug}
      className="-mx-4 -my-5 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background text-foreground sm:-mx-6 lg:-mx-8"
    >
      <div
        className={cn(
          "grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-rows-1",
          isSparseInbox
            ? "lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)]"
            : "lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)]",
        )}
      >
        <InboxPanelErrorBoundary
          scope="list"
          className="max-h-[40svh] min-h-0 shrink-0 lg:h-full lg:max-h-none lg:shrink"
          resetKeys={[
            selectionKey,
            conversations.length,
            notifications.length,
            conversationsIsLoading,
            notificationsIsLoading,
          ]}
        >
          <InboxList
            conversations={conversations}
            currentUser={currentUser}
            hasMoreNotifications={hasMoreNotifications}
            isError={listIsError}
            isLoading={listIsLoading}
            isLoadingMoreNotifications={isLoadingMoreNotifications}
            notifications={notifications}
            onLoadMoreNotifications={onLoadMoreNotifications}
            onMarkAllRead={onMarkAllRead}
            onSelectConversation={onSelectConversation}
            onSelectNotification={onSelectNotification}
            selection={selection}
            unreadNotificationCount={unreadNotificationCount}
          />
        </InboxPanelErrorBoundary>

        {selection?.kind === "notification" ? (
          selectedNotification ? (
            <InboxIssuePanel
              organizationSlug={organizationSlug}
              projectId={selectedNotification.projectId}
              issueId={selectedNotification.issueId}
            />
          ) : selectedNotificationIsLoading ? (
            <section
              className="flex min-h-0 flex-1 items-center justify-center p-6"
              aria-busy="true"
              aria-label="Loading notification"
            >
              <span className="text-sm text-muted-foreground">
                <FormattedMessage {...inboxNotificationsMessages.issuePanelLoading} />
              </span>
            </section>
          ) : null
        ) : (
          <ConversationPanel
            conversation={selectedConversation}
            currentUser={currentUser}
            isSending={isSending}
            isStreaming={isStreaming}
            jobs={jobs}
            jobsIsLoading={jobsIsLoading}
            messages={messages}
            messagesIsLoading={messagesIsLoading}
            onSendMessage={onSendMessage}
            organizationSlug={organizationSlug}
            streamedAssistant={streamedAssistant}
          />
        )}
      </div>
    </main>
  );
}
