"use client";

import { cn } from "@/lib/primitives/cn";

import { ConversationPanel } from "./conversation-panel";
import { InboxList } from "./inbox-list";
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
  isSending,
  isSparseInbox,
  isStreaming,
  jobs,
  jobsIsLoading,
  messages,
  messagesIsLoading,
  onSelectConversation,
  onSendMessage,
  organizationSlug,
  selectedConversation,
  selectedConversationId,
  streamedAssistant,
}: {
  conversations: Conversation[];
  conversationsIsError: boolean;
  conversationsIsLoading: boolean;
  currentUser: InboxCurrentUser;
  isSending: boolean;
  isSparseInbox: boolean;
  isStreaming: boolean;
  jobs: LinkedJob[];
  jobsIsLoading: boolean;
  messages: ConversationMessage[];
  messagesIsLoading: boolean;
  onSelectConversation: (conversationId: string) => void;
  onSendMessage: (
    text: string,
    files: File[],
    options?: { projectId?: string; repositoryFullName?: string },
  ) => void | Promise<void>;
  organizationSlug: string;
  selectedConversation: Conversation | undefined;
  selectedConversationId: string;
  streamedAssistant: StreamedAssistantMessage | null;
}) {
  return (
    <main
      data-organization={organizationSlug}
      className="-mx-4 -my-5 flex h-[calc(100svh-var(--app-shell-header-height))] min-h-0 flex-col overflow-hidden bg-background text-foreground sm:-mx-6 lg:-mx-8"
    >
      <div
        className={cn(
          "grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-rows-1",
          isSparseInbox
            ? "lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)]"
            : "lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)]",
        )}
      >
        <InboxList
          conversations={conversations}
          currentUser={currentUser}
          isError={conversationsIsError}
          isLoading={conversationsIsLoading}
          onSelectConversation={onSelectConversation}
          selectedConversationId={selectedConversationId}
        />

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
      </div>
    </main>
  );
}
