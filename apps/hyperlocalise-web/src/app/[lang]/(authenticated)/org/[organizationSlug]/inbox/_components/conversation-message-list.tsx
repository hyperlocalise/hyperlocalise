"use client";

import type {
  DynamicToolUIPart,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  ToolUIPart,
  UIMessage,
} from "ai";
import { DownloadIcon, FileTextIcon } from "lucide-react";
import { memo, type ReactNode } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyMuted, TypographyP, TypographySmall } from "@/components/ui/typography";

import {
  formatRelativeTime,
  initialsFor,
  type ConversationMessage,
  type ConversationMessageAttachment,
  type InboxCurrentUser,
  type StreamedAssistantMessage,
} from "./inbox-types";

type SourcePart = SourceUrlUIPart | SourceDocumentUIPart;
type ToolPart = ToolUIPart | DynamicToolUIPart;

function toAssistantUIMessage(message: ConversationMessage): UIMessage {
  return {
    id: message.id,
    role: "assistant",
    parts:
      message.parts && message.parts.length > 0
        ? message.parts
        : message.text
          ? [{ type: "text", text: message.text, state: "done" }]
          : [],
  };
}

export function ConversationMessageList({
  conversationId,
  currentUser,
  isLoading,
  isStreaming,
  messages,
  streamedAssistant,
}: {
  conversationId: string;
  currentUser: InboxCurrentUser;
  isLoading: boolean;
  isStreaming: boolean;
  messages: ConversationMessage[];
  streamedAssistant: StreamedAssistantMessage | null;
}) {
  const activeStream =
    streamedAssistant?.conversationId === conversationId ? streamedAssistant : null;
  let renderedStream = false;

  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="mx-auto w-full max-w-4xl gap-4 px-4 py-5 sm:px-6">
        {isLoading ? (
          <MessageListSkeleton />
        ) : messages.length === 0 && !activeStream ? (
          <ConversationEmptyState
            className="min-h-96"
            title="No messages yet"
            description="Conversation messages will appear here."
          />
        ) : (
          <>
            {messages.map((message, index) => {
              const previousMessage = messages[index - 1];
              const shouldRenderStream =
                message.senderType === "agent" &&
                activeStream?.responseToMessageId === previousMessage?.id;

              if (shouldRenderStream && activeStream) {
                renderedStream = true;
                return (
                  <AssistantStreamMessage
                    key={message.id}
                    message={activeStream.message}
                    isStreaming={isStreaming && activeStream.status === "streaming"}
                    createdAt={message.createdAt}
                  />
                );
              }

              return (
                <PersistedMessage key={message.id} currentUser={currentUser} message={message} />
              );
            })}

            {activeStream &&
            !renderedStream &&
            messages.at(-1)?.id === activeStream.responseToMessageId ? (
              <AssistantStreamMessage
                message={activeStream.message}
                isStreaming={isStreaming && activeStream.status === "streaming"}
                createdAt={null}
              />
            ) : null}
          </>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

function MessageListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full bg-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-24 bg-muted" />
            <Skeleton className="h-3 w-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Memoized to prevent re-rendering historical messages while a new message is streaming
const PersistedMessage = memo(function PersistedMessage({
  currentUser,
  message,
}: {
  currentUser: InboxCurrentUser;
  message: ConversationMessage;
}) {
  const role = message.senderType === "user" ? "user" : "assistant";
  const userAvatar = message.senderType === "user" ? getUserAvatar({ currentUser, message }) : null;

  return (
    <MessageFrame
      role={role}
      avatarAlt={userAvatar?.alt}
      avatarImageUrl={userAvatar?.imageUrl ?? null}
      avatarLabel={userAvatar?.label}
      createdAt={message.createdAt}
    >
      <div className="flex flex-col gap-3">
        {message.senderType === "user" ? (
          <TypographyP className="whitespace-pre-wrap leading-6">{message.text}</TypographyP>
        ) : message.parts && message.parts.length > 0 ? (
          <AssistantMessageParts isStreaming={false} message={toAssistantUIMessage(message)} />
        ) : (
          <MessageResponse>{message.text}</MessageResponse>
        )}
        <MessageAttachments attachments={message.attachments} />
      </div>
    </MessageFrame>
  );
});

function MessageAttachments({ attachments }: { attachments: ConversationMessage["attachments"] }) {
  if (!attachments?.length) {
    return null;
  }

  const imageAttachments = attachments.filter(isImageAttachment);
  const fileAttachments = attachments.filter((attachment) => !isImageAttachment(attachment));

  return (
    <div className="flex max-w-full flex-col gap-2">
      {imageAttachments.length > 0 ? (
        <div className="grid max-w-full grid-cols-1 gap-2 sm:grid-cols-2">
          {imageAttachments.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-md border border-border bg-muted/35"
            >
              <img
                src={attachment.url}
                alt={attachment.filename}
                className="aspect-video w-full object-contain"
              />
              <span className="block truncate border-t border-border px-2 py-1.5 text-xs text-muted-foreground group-hover:text-foreground">
                {attachment.filename}
              </span>
            </a>
          ))}
        </div>
      ) : null}
      {fileAttachments.map((attachment) => (
        <a
          key={attachment.id}
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          className="flex max-w-full items-center gap-2 rounded-md border border-border bg-muted/35 px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
          <DownloadIcon className="size-4 shrink-0 text-muted-foreground" />
        </a>
      ))}
    </div>
  );
}

function isImageAttachment(attachment: ConversationMessageAttachment) {
  return attachment.contentType.toLowerCase().startsWith("image/");
}

function AssistantStreamMessage({
  createdAt,
  isStreaming,
  message,
}: {
  createdAt: string | null;
  isStreaming: boolean;
  message: UIMessage;
}) {
  return (
    <MessageFrame role="assistant" createdAt={createdAt}>
      <AssistantMessageParts message={message} isStreaming={isStreaming} />
    </MessageFrame>
  );
}

function MessageFrame({
  avatarAlt,
  avatarImageUrl,
  avatarLabel,
  children,
  createdAt,
  role,
}: {
  avatarAlt?: string;
  avatarImageUrl?: string | null;
  avatarLabel?: string;
  children: ReactNode;
  createdAt: string | null;
  role: "user" | "assistant";
}) {
  const timestamp = (
    <TypographyMuted className="mt-1 text-xs">
      {createdAt ? formatRelativeTime(createdAt) : "now"}
    </TypographyMuted>
  );

  if (role === "assistant") {
    return (
      <Message from="assistant" className="w-full max-w-full">
        <MessageContent className="w-full max-w-full leading-6">
          {children}
          {timestamp}
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message from="user" className="max-w-[85%]">
      <div className="flex flex-row-reverse items-start gap-3">
        <Avatar className="size-8 shrink-0 bg-muted">
          {avatarImageUrl ? (
            <AvatarImage src={avatarImageUrl} alt={avatarAlt ?? avatarLabel} />
          ) : null}
          <AvatarFallback className="bg-muted text-[10px] font-medium text-foreground">
            {avatarLabel}
          </AvatarFallback>
        </Avatar>
        <MessageContent className="leading-6">
          {children}
          {timestamp}
        </MessageContent>
      </div>
    </Message>
  );
}

function getUserAvatar({
  currentUser,
  message,
}: {
  currentUser: InboxCurrentUser;
  message: ConversationMessage;
}) {
  const isCurrentUser = !message.senderEmail || message.senderEmail === currentUser.email;
  const displayName = isCurrentUser ? currentUser.name : message.senderEmail;
  const label = initialsFor(displayName ?? "User");

  return {
    alt: displayName ?? "User",
    imageUrl: isCurrentUser ? currentUser.avatarUrl : null,
    label,
  };
}

function AssistantMessageParts({
  isStreaming,
  message,
}: {
  isStreaming: boolean;
  message: UIMessage;
}) {
  const reasoningParts = message.parts.filter(isReasoningPart);
  const sourceParts = message.parts.filter(isSourcePart);
  const toolParts = message.parts.filter(isToolPart);
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

  return (
    <>
      {sourceParts.length > 0 ? <AssistantSources parts={sourceParts} /> : null}
      {reasoningParts.map((part, index) =>
        part.text.trim() ? (
          <Reasoning
            key={`${part.type}-${index}`}
            isStreaming={isStreaming || part.state === "streaming"}
            className="mb-3"
          >
            <ReasoningTrigger />
            <ReasoningContent>{part.text}</ReasoningContent>
          </Reasoning>
        ) : null,
      )}
      {toolParts.map((part, index) => (
        <AssistantToolPart key={`${part.type}-${index}`} part={part} />
      ))}
      {text ? <MessageResponse>{text}</MessageResponse> : isStreaming ? <TypingIndicator /> : null}
    </>
  );
}

function AssistantToolPart({ part }: { part: ToolPart }) {
  const isDynamic = part.type === "dynamic-tool";
  const headerProps = isDynamic
    ? {
        type: part.type,
        state: part.state,
        toolName: part.toolName,
      }
    : {
        type: part.type,
        state: part.state,
      };

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader {...headerProps} />
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
}

function AssistantSources({ parts }: { parts: SourcePart[] }) {
  return (
    <Sources className="mb-3 text-muted-foreground">
      <SourcesTrigger count={parts.length} />
      <SourcesContent className="w-full">
        {parts.map((part) =>
          part.type === "source-url" ? (
            <Source key={part.sourceId} href={part.url} title={getSourceTitle(part)} />
          ) : (
            <div
              key={part.sourceId}
              className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs"
            >
              <TypographySmall className="text-xs">
                {part.title || part.filename || "Document"}
              </TypographySmall>
              <span className="text-muted-foreground">{part.mediaType}</span>
            </div>
          ),
        )}
      </SourcesContent>
    </Sources>
  );
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
    </span>
  );
}

function isReasoningPart(part: UIMessage["parts"][number]): part is ReasoningUIPart {
  return part.type === "reasoning";
}

function isSourcePart(part: UIMessage["parts"][number]): part is SourcePart {
  return part.type === "source-url" || part.type === "source-document";
}

function isToolPart(part: UIMessage["parts"][number]): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function getSourceTitle(part: SourceUrlUIPart) {
  if (part.title) return part.title;

  try {
    return new URL(part.url).hostname;
  } catch {
    return part.url;
  }
}
