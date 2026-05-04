"use client";

import type {
  DynamicToolUIPart,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  ToolUIPart,
  UIMessage,
} from "ai";
import type { ReactNode } from "react";

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
import { cn } from "@/lib/utils";

import {
  formatRelativeTime,
  type ConversationMessage,
  type InboxCurrentUser,
  type StreamedAssistantMessage,
} from "./inbox-types";

type SourcePart = SourceUrlUIPart | SourceDocumentUIPart;
type ToolPart = ToolUIPart | DynamicToolUIPart;
const agentAvatar = {
  alt: "Hyperlocalise",
  imageUrl: "/images/logo.png",
  label: "H",
};

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

function PersistedMessage({
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
      avatarAlt={userAvatar?.alt ?? agentAvatar.alt}
      avatarImageUrl={userAvatar?.imageUrl ?? agentAvatar.imageUrl}
      avatarLabel={userAvatar?.label ?? agentAvatar.label}
      createdAt={message.createdAt}
    >
      {message.senderType === "user" ? (
        <p className="whitespace-pre-wrap">{message.text}</p>
      ) : (
        <MessageResponse>{message.text}</MessageResponse>
      )}
    </MessageFrame>
  );
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
    <MessageFrame
      role="assistant"
      avatarAlt={agentAvatar.alt}
      avatarImageUrl={agentAvatar.imageUrl}
      avatarLabel={agentAvatar.label}
      createdAt={createdAt}
    >
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
  avatarLabel: string;
  children: ReactNode;
  createdAt: string | null;
  role: "user" | "assistant";
}) {
  return (
    <Message from={role} className={cn(role === "user" ? "max-w-[85%]" : "max-w-[95%]")}>
      <div className={cn("flex items-start gap-3", role === "user" && "flex-row-reverse")}>
        <Avatar className="size-8 shrink-0 bg-muted">
          {avatarImageUrl ? (
            <AvatarImage src={avatarImageUrl} alt={avatarAlt ?? avatarLabel} />
          ) : null}
          <AvatarFallback className="bg-muted text-[10px] font-medium text-foreground">
            {avatarLabel}
          </AvatarFallback>
        </Avatar>
        <MessageContent
          className={cn(
            "leading-6",
            role === "assistant" && "rounded-xl bg-dew-500/10 px-4 py-2.5",
          )}
        >
          {children}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {createdAt ? formatRelativeTime(createdAt) : "now"}
          </p>
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

function initialsFor(value: string) {
  const [first = "U", second = ""] = value
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  return `${first[0] ?? "U"}${second[0] ?? ""}`.toUpperCase();
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
      {text ? <MessageResponse>{text}</MessageResponse> : <TypingIndicator />}
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
              <span className="font-medium">{part.title || part.filename || "Document"}</span>
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
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
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
