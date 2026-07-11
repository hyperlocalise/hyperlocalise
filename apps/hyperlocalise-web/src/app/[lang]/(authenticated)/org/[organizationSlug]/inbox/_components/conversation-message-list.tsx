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

import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { AiElementErrorBoundary } from "@/components/ai-elements/ai-element-error-boundary";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import {
  serializeToolJson,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageAvatar, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition="last-anchor"
      scrollPreviousItemPeek={64}
    >
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-4xl gap-4 px-4 py-5 sm:px-6">
            {isLoading ? (
              <MessageScrollerItem messageId="loading">
                <MessageListSkeleton />
              </MessageScrollerItem>
            ) : messages.length === 0 && !activeStream ? (
              <MessageScrollerItem messageId="empty">
                <ConversationEmptyState
                  className="min-h-96"
                  title="No messages yet"
                  description="Conversation messages will appear here."
                />
              </MessageScrollerItem>
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
                      <MessageScrollerItem key={message.id} messageId={message.id}>
                        <AssistantStreamMessage
                          message={activeStream.message}
                          isStreaming={isStreaming && activeStream.status === "streaming"}
                          createdAt={message.createdAt}
                        />
                      </MessageScrollerItem>
                    );
                  }

                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={message.senderType === "user"}
                    >
                      <PersistedMessage currentUser={currentUser} message={message} />
                    </MessageScrollerItem>
                  );
                })}

                {activeStream &&
                !renderedStream &&
                messages.at(-1)?.id === activeStream.responseToMessageId ? (
                  <MessageScrollerItem messageId={activeStream.message.id}>
                    <AssistantStreamMessage
                      message={activeStream.message}
                      isStreaming={isStreaming && activeStream.status === "streaming"}
                      createdAt={null}
                    />
                  </MessageScrollerItem>
                ) : null}
              </>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
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
          <AiElementErrorBoundary scope="message" resetKeys={[message.id, message.text]}>
            <MessageResponse>{message.text}</MessageResponse>
          </AiElementErrorBoundary>
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
  const timestamp = createdAt ? formatRelativeTime(createdAt) : "now";

  if (role === "assistant") {
    return (
      <Message className="w-full max-w-full">
        <MessageContent className="w-full max-w-full leading-6">
          {children}
          <MessageFooter className="px-0">
            <TypographyMuted className="text-xs">{timestamp}</TypographyMuted>
          </MessageFooter>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message align="end" className="max-w-[85%]">
      <MessageAvatar className="size-8 self-start">
        <Avatar className="size-8 shrink-0 bg-muted">
          {avatarImageUrl ? (
            <AvatarImage src={avatarImageUrl} alt={avatarAlt ?? avatarLabel} />
          ) : null}
          <AvatarFallback className="bg-muted text-[10px] font-medium text-foreground">
            {avatarLabel}
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent className="leading-6">
        <div className="w-fit max-w-full rounded-lg bg-muted px-4 py-3 text-foreground">
          {children}
        </div>
        <MessageFooter className="px-0">
          <TypographyMuted className="text-xs">{timestamp}</TypographyMuted>
        </MessageFooter>
      </MessageContent>
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
    .map((part) => part.text ?? "")
    .join("");

  return (
    <>
      {sourceParts.length > 0 ? (
        <AiElementErrorBoundary
          scope="sources"
          resetKeys={sourceParts.map((part) =>
            part.type === "source-url"
              ? `${part.sourceId}:${part.url}:${part.title ?? ""}`
              : `${part.sourceId}:${part.title ?? ""}:${part.filename ?? ""}:${part.mediaType ?? ""}`,
          )}
        >
          <AssistantSources parts={sourceParts} />
        </AiElementErrorBoundary>
      ) : null}
      {reasoningParts.map((part, index) =>
        part.text?.trim() ? (
          <AiElementErrorBoundary
            key={`${part.type}-${index}`}
            scope="reasoning"
            resetKeys={[part.text, part.state]}
          >
            <Reasoning isStreaming={isStreaming || part.state === "streaming"} className="mb-3">
              <ReasoningTrigger />
              <ReasoningContent>{part.text}</ReasoningContent>
            </Reasoning>
          </AiElementErrorBoundary>
        ) : null,
      )}
      {toolParts.map((part, index) => (
        <AiElementErrorBoundary
          key={`${part.type}-${index}`}
          scope="tool"
          resetKeys={[
            part.type,
            part.state,
            part.toolCallId,
            serializeToolJson(part.input),
            serializeToolJson(part.output),
            part.errorText ?? "",
          ]}
        >
          <AssistantToolPart part={part} />
        </AiElementErrorBoundary>
      ))}
      {text ? (
        <AiElementErrorBoundary scope="message" resetKeys={[text, isStreaming]}>
          <MessageResponse isAnimating={isStreaming}>{text}</MessageResponse>
        </AiElementErrorBoundary>
      ) : isStreaming ? (
        <Marker role="status">
          <MarkerIcon>
            <Spinner />
          </MarkerIcon>
          <MarkerContent>Hyperlocalise is working…</MarkerContent>
        </Marker>
      ) : null}
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
    <Tool>
      <ToolHeader {...headerProps} input={part.input} />
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
