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
  onSendMessage: (text: string, files: File[], projectId?: string) => void | Promise<void>;
  organizationSlug: string;
  selectedConversation: Conversation | undefined;
  selectedConversationId: string;
  streamedAssistant: StreamedAssistantMessage | null;
}) {
  return (
    <main
      data-organization={organizationSlug}
      className="-mx-4 -my-5 bg-background text-foreground sm:-mx-6 lg:-mx-8 lg:min-h-[calc(100svh-3.5rem)] lg:overflow-hidden"
    >
      <div
        className={cn(
          "grid grid-cols-1 lg:min-h-[calc(100svh-3.5rem)]",
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
