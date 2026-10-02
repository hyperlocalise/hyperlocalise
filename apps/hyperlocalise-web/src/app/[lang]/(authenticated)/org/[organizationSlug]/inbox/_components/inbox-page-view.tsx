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
import { useIntl } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";

import { ConversationPanel } from "./conversation-panel";
import { inboxChatSplitPaneClassName } from "./inbox-chat-split-pane";
import type { ChatComposerSendOptions } from "./inbox-api";
import { InboxIssuePanel } from "./inbox-issue-panel";
import {
  InboxList,
  type InboxItemHref,
  type InboxListItemSelection,
  type InboxSelection,
} from "./inbox-list";
import type { InboxListFilters } from "./inbox-list-filters";
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
  draft = "",
  filters,
  hasMoreNotifications,
  isLoadingMoreNotifications,
  isSending,
  isSparseInbox,
  isStreaming,
  jobs,
  jobsIsLoading,
  messages,
  messagesIsLoading,
  itemHref,
  notifications,
  notificationsIsError,
  notificationsIsLoading,
  onDraftChange,
  onFiltersChange,
  onLoadMoreNotifications,
  onMarkAllRead,
  onSelectItem,
  onDeletedQuery,
  canDeleteQueries = false,
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
  draft?: string;
  filters?: InboxListFilters;
  hasMoreNotifications: boolean;
  isLoadingMoreNotifications: boolean;
  isSending: boolean;
  isSparseInbox: boolean;
  isStreaming: boolean;
  jobs: LinkedJob[];
  jobsIsLoading: boolean;
  messages: ConversationMessage[];
  messagesIsLoading: boolean;
  itemHref?: InboxItemHref;
  notifications: InboxIssueNotification[];
  notificationsIsError: boolean;
  notificationsIsLoading: boolean;
  onDraftChange?: (draft: string) => void;
  onFiltersChange?: (filters: InboxListFilters) => void;
  onLoadMoreNotifications: () => void;
  onMarkAllRead: () => void;
  onSelectItem: (selection: InboxListItemSelection) => void;
  onDeletedQuery?: () => void;
  canDeleteQueries?: boolean;
  onSendMessage: (
    text: string,
    files: File[],
    options?: ChatComposerSendOptions,
  ) => void | Promise<void>;
  organizationSlug: string;
  selectedConversation: Conversation | undefined;
  selectedNotification: InboxIssueNotification | undefined;
  selectedNotificationIsLoading: boolean;
  selection: InboxSelection;
  streamedAssistant: StreamedAssistantMessage | null;
  unreadNotificationCount: number;
}) {
  const intl = useIntl();
  const listIsLoading = conversationsIsLoading || notificationsIsLoading;
  const listIsError = conversationsIsError || notificationsIsError;
  const selectionKey =
    selection?.kind === "conversation"
      ? `conversation:${selection.id}`
      : selection?.kind === "notification"
        ? `notification:${selection.id}`
        : selection?.kind === "new"
          ? "new"
          : "none";

  return (
    <main
      data-organization={organizationSlug}
      className="-mx-4 -my-5 flex h-[var(--app-shell-content-height)] min-h-0 flex-col overflow-hidden bg-background text-foreground sm:-mx-6 lg:-mx-8"
    >
      <div className={inboxChatSplitPaneClassName(isSparseInbox)}>
        <InboxPanelErrorBoundary
          scope="list"
          className="max-h-[40svh] min-h-0 shrink-0 lg:h-full lg:max-h-none lg:shrink"
          resetKeys={[conversations.length, notifications.length]}
        >
          <InboxList
            conversations={conversations}
            currentUser={currentUser}
            filters={filters}
            hasMoreNotifications={hasMoreNotifications}
            isError={listIsError}
            isLoading={listIsLoading}
            isLoadingMoreNotifications={isLoadingMoreNotifications}
            notifications={notifications}
            onFiltersChange={onFiltersChange}
            onLoadMoreNotifications={onLoadMoreNotifications}
            onMarkAllRead={onMarkAllRead}
            onSelectItem={onSelectItem}
            itemHref={
              itemHref ??
              ((item) =>
                item.kind === "notification"
                  ? `/org/${organizationSlug}/inbox/notifications/${item.id}`
                  : `/org/${organizationSlug}/inbox/${item.id}`)
            }
            selection={selection}
            unreadNotificationCount={unreadNotificationCount}
          />
        </InboxPanelErrorBoundary>

        <InboxPanelErrorBoundary
          scope="messages"
          className="min-h-0 min-w-0 flex-1"
          resetKeys={[selectionKey]}
        >
          <div key={selectionKey} className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            {selection?.kind === "notification" ? (
              selectedNotification ? (
                <InboxIssuePanel
                  organizationSlug={organizationSlug}
                  projectId={selectedNotification.projectId}
                  issueId={selectedNotification.issueId}
                  canDelete={canDeleteQueries}
                  onDeleted={onDeletedQuery}
                />
              ) : selectedNotificationIsLoading ? (
                <section
                  className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
                  aria-busy="true"
                  aria-label={intl.formatMessage(inboxNotificationsMessages.issuePanelLoading)}
                >
                  <InboxIssuePanelSkeleton />
                </section>
              ) : null
            ) : (
              <ConversationPanel
                conversation={selectedConversation}
                currentUser={currentUser}
                draft={draft}
                isComposingNew={selection?.kind === "new"}
                isSending={isSending}
                isStreaming={isStreaming}
                jobs={jobs}
                jobsIsLoading={jobsIsLoading}
                messages={messages}
                messagesIsLoading={messagesIsLoading}
                onDraftChange={onDraftChange}
                onSendMessage={onSendMessage}
                organizationSlug={organizationSlug}
                streamedAssistant={streamedAssistant}
              />
            )}
          </div>
        </InboxPanelErrorBoundary>
      </div>
    </main>
  );
}

function InboxIssuePanelSkeleton() {
  return (
    <div className="grid h-full min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden md:grid-cols-[minmax(0,1fr)_22rem] md:grid-rows-none">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-border bg-muted/20 px-4 py-5 md:border-t-0 md:border-s">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="ml-auto h-7 w-24" />
        <Skeleton className="ml-auto h-7 w-20" />
        <Skeleton className="ml-auto h-7 w-28" />
      </aside>
    </div>
  );
}
