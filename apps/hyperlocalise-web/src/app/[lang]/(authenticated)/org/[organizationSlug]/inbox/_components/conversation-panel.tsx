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
import { BubbleChatNotificationIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { TypographyH4, TypographyMuted } from "@/components/ui/typography";

import { ConversationMessageList } from "./conversation-message-list";
import { conversationPanelMessages } from "./conversation-panel.messages";
import { InboxPanelErrorBoundary } from "./inbox-panel-error-boundary";
import {
  formatRelativeTime,
  getSourceLabel,
  getStatusLabel,
  statusStyles,
  type Conversation,
  type ConversationMessage,
  type InboxCurrentUser,
  type LinkedJob,
  type StreamedAssistantMessage,
} from "./inbox-types";
import { ReplyComposer } from "./reply-composer";

export function ConversationPanel({
  conversation,
  currentUser,
  isSending,
  isStreaming,
  jobs,
  jobsIsLoading,
  messages,
  messagesIsLoading,
  onSendMessage,
  organizationSlug,
  streamedAssistant,
}: {
  conversation: Conversation | undefined;
  currentUser: InboxCurrentUser;
  isSending: boolean;
  isStreaming: boolean;
  jobs: LinkedJob[];
  jobsIsLoading: boolean;
  messages: ConversationMessage[];
  messagesIsLoading: boolean;
  onSendMessage: (
    text: string,
    files: File[],
    options?: { projectId?: string; repositoryFullName?: string },
  ) => void | Promise<void>;
  organizationSlug: string;
  streamedAssistant: StreamedAssistantMessage | null;
}) {
  if (!conversation) {
    return (
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background">
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <TypographyMuted>
            <FormattedMessage {...conversationPanelMessages.selectConversation} />
          </TypographyMuted>
        </div>
      </section>
    );
  }

  const isChatUi = conversation.source === "chat_ui";
  const composerDisabled = isSending || isStreaming;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <ConversationHeader conversation={conversation} jobs={jobs} jobsIsLoading={jobsIsLoading} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <InboxPanelErrorBoundary
          scope="messages"
          className="min-h-0 flex-1"
          resetKeys={[conversation.id, messages, streamedAssistant?.message]}
        >
          <ConversationMessageList
            conversationId={conversation.id}
            currentUser={currentUser}
            isLoading={messagesIsLoading}
            isStreaming={isStreaming}
            messages={messages}
            streamedAssistant={streamedAssistant}
          />
        </InboxPanelErrorBoundary>

        {isChatUi ? (
          <InboxPanelErrorBoundary scope="composer" resetKeys={[conversation.id, composerDisabled]}>
            <ReplyComposer
              disabled={composerDisabled}
              isStreaming={isStreaming}
              onSend={onSendMessage}
              organizationSlug={organizationSlug}
            />
          </InboxPanelErrorBoundary>
        ) : null}
      </div>
    </section>
  );
}

function ConversationHeader({
  conversation,
  jobs,
  jobsIsLoading,
}: {
  conversation: Conversation;
  jobs: LinkedJob[];
  jobsIsLoading: boolean;
}) {
  const intl = useIntl();

  return (
    <header className="flex min-h-16 items-center border-b border-border px-4 py-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <HugeiconsIcon
          icon={BubbleChatNotificationIcon}
          strokeWidth={1.8}
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0">
          <TypographyH4 className="truncate text-base">{conversation.title}</TypographyH4>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-border bg-muted text-foreground">
              {getSourceLabel(conversation.source, intl)}
            </Badge>
            <Badge variant="outline" className={statusStyles[conversation.status]}>
              {getStatusLabel(conversation.status, intl)}
            </Badge>
            <span>
              <FormattedMessage
                {...conversationPanelMessages.createdAt}
                values={{ relativeTime: formatRelativeTime(conversation.createdAt, intl) }}
              />
            </span>
            {jobsIsLoading ? (
              <span>
                <FormattedMessage {...conversationPanelMessages.checkingLinkedJobs} />
              </span>
            ) : null}
            {!jobsIsLoading && jobs.length > 0 ? (
              <span>
                <FormattedMessage
                  {...conversationPanelMessages.linkedJobsCount}
                  values={{ count: jobs.length }}
                />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
