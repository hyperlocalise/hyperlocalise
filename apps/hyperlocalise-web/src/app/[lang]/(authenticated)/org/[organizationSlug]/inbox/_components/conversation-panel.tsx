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
import { useRef, type ReactNode } from "react";
import { BubbleChatNotificationIcon, Chat01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { ChatDockEmptyState } from "@/components/app-shell/chat-dock/chat-dock-empty-state";
import { chatDockMessages } from "@/components/app-shell/chat-dock/chat-dock.messages";
import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button";
import { Badge } from "@/components/ui/badge";
import { Box } from "@/components/ui/layout/box";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyH4, TypographyMuted } from "@/components/ui/typography";
import { useAiFeaturesAccess } from "@/lib/billing/use-ai-features-access";

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

function InboxAiComposer({
  organizationSlug,
  children,
}: {
  organizationSlug: string;
  children: ReactNode;
}) {
  const access = useAiFeaturesAccess();

  if (access.status === "loading") {
    return null;
  }

  if (access.status === "denied") {
    return (
      <div className="border-t border-border">
        <Box paddingX="3u" paddingY="1.5u">
          <UpgradePlanButton organizationSlug={organizationSlug} size="sm" />
        </Box>
      </div>
    );
  }

  return children;
}

export function ConversationPanel({
  conversation,
  currentUser,
  draft = "",
  isComposingNew = false,
  isSending,
  isStreaming,
  jobs,
  jobsIsLoading,
  messages,
  messagesIsLoading,
  onDraftChange,
  onSendMessage,
  organizationSlug,
  streamedAssistant,
}: {
  conversation: Conversation | undefined;
  currentUser: InboxCurrentUser;
  draft?: string;
  isComposingNew?: boolean;
  isSending: boolean;
  isStreaming: boolean;
  jobs: LinkedJob[];
  jobsIsLoading: boolean;
  messages: ConversationMessage[];
  messagesIsLoading: boolean;
  onDraftChange?: (draft: string) => void;
  onSendMessage: (
    text: string,
    files: File[],
    options?: { projectId?: string; repositoryFullName?: string },
  ) => void | Promise<void>;
  organizationSlug: string;
  streamedAssistant: StreamedAssistantMessage | null;
}) {
  const intl = useIntl();
  const panelRef = useRef<HTMLElement>(null);

  if (isComposingNew) {
    const composerDisabled = isSending || isStreaming;

    return (
      <section
        ref={panelRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      >
        <header className="border-b border-border">
          <Box paddingX="3u" paddingY="1.5u" display="flex" alignItems="center">
            <Row spacing="1.5u" alignY="center">
              <HugeiconsIcon
                icon={Chat01Icon}
                strokeWidth={1.8}
                className="size-5 shrink-0 text-muted-foreground"
              />
              <Rows spacing="0.5u">
                <TypographyH4 lineClamp={1} size="medium">
                  <FormattedMessage {...conversationPanelMessages.newRequestTitle} />
                </TypographyH4>
                <TypographyMuted size="xsmall">
                  <FormattedMessage {...conversationPanelMessages.newRequestSubtitle} />
                </TypographyMuted>
              </Rows>
            </Row>
          </Box>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatDockEmptyState
            onSelectSuggestion={(prompt) => {
              onDraftChange?.(prompt);
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
          <InboxAiComposer organizationSlug={organizationSlug}>
            <InboxPanelErrorBoundary scope="composer" resetKeys={[composerDisabled, draft]}>
              <ReplyComposer
                disabled={composerDisabled}
                draft={draft}
                isStreaming={isStreaming}
                onDraftChange={onDraftChange}
                onSend={onSendMessage}
                organizationSlug={organizationSlug}
                placeholder={intl.formatMessage(chatDockMessages.emptyComposer)}
              />
            </InboxPanelErrorBoundary>
          </InboxAiComposer>
        </div>
      </section>
    );
  }

  if (!conversation) {
    return (
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background">
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          height="full"
          background="canvas"
        >
          <TypographyMuted>
            <FormattedMessage {...conversationPanelMessages.selectConversation} />
          </TypographyMuted>
        </Box>
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
          <InboxAiComposer organizationSlug={organizationSlug}>
            <InboxPanelErrorBoundary
              scope="composer"
              resetKeys={[conversation.id, composerDisabled]}
            >
              <ReplyComposer
                disabled={composerDisabled}
                isStreaming={isStreaming}
                lockedProjectId={conversation.projectId}
                onSend={onSendMessage}
                organizationSlug={organizationSlug}
              />
            </InboxPanelErrorBoundary>
          </InboxAiComposer>
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
    <header className="border-b border-border">
      <Box paddingX="3u" paddingY="1.5u" display="flex" alignItems="center">
        <Row spacing="1.5u" alignY="start">
          <HugeiconsIcon
            icon={BubbleChatNotificationIcon}
            strokeWidth={1.8}
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />
          <Rows spacing="1u">
            <TypographyH4 lineClamp={1} size="medium">
              {conversation.title}
            </TypographyH4>
            <Box display="flex" flexWrap="wrap" alignItems="center" gap="1u">
              <Badge variant="outline" className="border-border bg-muted text-foreground">
                {getSourceLabel(conversation.source, intl)}
              </Badge>
              <Badge variant="outline" className={statusStyles[conversation.status]}>
                {getStatusLabel(conversation.status, intl)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                <FormattedMessage
                  {...conversationPanelMessages.createdAt}
                  values={{ relativeTime: formatRelativeTime(conversation.createdAt, intl) }}
                />
              </span>
              {jobsIsLoading ? (
                <span className="text-xs text-muted-foreground">
                  <FormattedMessage {...conversationPanelMessages.checkingLinkedJobs} />
                </span>
              ) : null}
              {!jobsIsLoading && jobs.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  <FormattedMessage
                    {...conversationPanelMessages.linkedJobsCount}
                    values={{ count: jobs.length }}
                  />
                </span>
              ) : null}
            </Box>
          </Rows>
        </Row>
      </Box>
    </header>
  );
}
