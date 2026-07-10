"use client";

import { BubbleChatNotificationIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { TypographyH4, TypographyMuted } from "@/components/ui/typography";

import { ConversationDetails } from "./conversation-details";
import { ConversationMessageList } from "./conversation-message-list";
import { InboxPanelErrorBoundary } from "./inbox-panel-error-boundary";
import {
  formatRelativeTime,
  sourceLabel,
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
          <TypographyMuted>Select a conversation to view details</TypographyMuted>
        </div>
      </section>
    );
  }

  const isChatUi = conversation.source === "chat_ui";
  const composerDisabled = isSending || isStreaming;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <ConversationHeader conversation={conversation} jobs={jobs} jobsIsLoading={jobsIsLoading} />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <InboxPanelErrorBoundary
          scope="details"
          resetKeys={[conversation.id, jobs.length, jobsIsLoading]}
        >
          <ConversationDetails
            conversation={conversation}
            jobs={jobs}
            jobsIsLoading={jobsIsLoading}
            organizationSlug={organizationSlug}
          />
        </InboxPanelErrorBoundary>

        <div className="flex min-h-0 flex-1 flex-col xl:pr-80">
          <InboxPanelErrorBoundary
            scope="messages"
            className="min-h-0 flex-1"
            resetKeys={[conversation.id, messages.length, streamedAssistant?.status]}
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
            <InboxPanelErrorBoundary
              scope="composer"
              resetKeys={[conversation.id, composerDisabled]}
            >
              <ReplyComposer
                disabled={composerDisabled}
                isStreaming={isStreaming}
                onSend={onSendMessage}
                organizationSlug={organizationSlug}
              />
            </InboxPanelErrorBoundary>
          ) : null}
        </div>
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
              {sourceLabel[conversation.source]}
            </Badge>
            <Badge variant="outline" className={statusStyles[conversation.status]}>
              {conversation.status}
            </Badge>
            <span>Created {formatRelativeTime(conversation.createdAt)}</span>
            {jobsIsLoading ? <span>Checking linked jobs</span> : null}
            {!jobsIsLoading && jobs.length > 0 ? (
              <span>{jobs.length === 1 ? "1 linked job" : `${jobs.length} linked jobs`}</span>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
