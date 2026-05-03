"use client";

import { BubbleChatNotificationIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ConversationDetails } from "./conversation-details";
import { ConversationMessageList } from "./conversation-message-list";
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
  onSendMessage: (text: string) => void;
  organizationSlug: string;
  streamedAssistant: StreamedAssistantMessage | null;
}) {
  if (!conversation) {
    return (
      <section className="min-h-0 bg-background">
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <p>Select a conversation to view details</p>
        </div>
      </section>
    );
  }

  const isChatUi = conversation.source === "chat_ui";
  const composerDisabled = isSending || isStreaming;

  return (
    <section className="flex min-h-0 flex-col bg-background">
      <ConversationHeader conversation={conversation} jobs={jobs} jobsIsLoading={jobsIsLoading} />

      <div className="relative flex h-[calc(100svh-7.5rem)] min-h-0 flex-col">
        <ConversationDetails
          conversation={conversation}
          jobs={jobs}
          jobsIsLoading={jobsIsLoading}
          organizationSlug={organizationSlug}
        />

        <div className="flex min-h-0 flex-1 flex-col xl:pr-80">
          <ConversationMessageList
            conversationId={conversation.id}
            currentUser={currentUser}
            isLoading={messagesIsLoading}
            isStreaming={isStreaming}
            messages={messages}
            streamedAssistant={streamedAssistant}
          />

          {isChatUi ? (
            <ReplyComposer
              conversationProjectId={conversation.projectId}
              disabled={composerDisabled}
              isStreaming={isStreaming}
              onSend={onSendMessage}
              organizationSlug={organizationSlug}
            />
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
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <HugeiconsIcon
          icon={BubbleChatNotificationIcon}
          strokeWidth={1.8}
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0">
          <h1 className="truncate font-heading text-base font-semibold">{conversation.title}</h1>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-border bg-muted text-foreground">
              {sourceLabel[conversation.source]}
            </Badge>
            <Badge className={cn("ring-1", statusStyles[conversation.status])}>
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
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="More inbox item actions"
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} className="size-4" />
        </Button>
      </div>
    </header>
  );
}
