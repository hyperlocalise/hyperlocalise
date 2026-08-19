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
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";
import { ImageAdd01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isApiResponseErrorCode, readApiResponseError } from "@/lib/api-error";
import { WEB_CHAT_IMAGE_CONTENT_TYPES, WEB_CHAT_MAX_IMAGE_FILES } from "@/lib/agents/workspace-automation-web-chat";
import { cn } from "@/lib/primitives/cn";

import { webChatPageMessages } from "./web-chat-page.messages";

type WebChatMessage = {
  id: string;
  conversationId: string;
  senderType: "user" | "agent";
  text: string;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    url: string;
  }> | null;
  createdAt: string;
};

type WebChatPageProps = {
  organizationSlug: string;
  automationId: string;
  agentName: string;
  organizationName: string;
  status: "active" | "paused";
};

function conversationQueryKey(organizationSlug: string, automationId: string) {
  return ["public-web-chat", organizationSlug, automationId] as const;
}

function textFromUiMessage(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

function isAllowedImage(file: File) {
  return WEB_CHAT_IMAGE_CONTENT_TYPES.has(file.type.toLowerCase());
}

export function WebChatPage({
  organizationSlug,
  automationId,
  agentName,
  organizationName,
  status,
}: WebChatPageProps) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const available = status === "active";

  const conversationQuery = useQuery({
    queryKey: conversationQueryKey(organizationSlug, automationId),
    queryFn: async () => {
      const response = await fetch(
        `/api/public/web-chat/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(automationId)}/conversation`,
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load conversation");
      }
      return response.json() as Promise<{
        conversation: { id: string; title: string } | null;
        messages: WebChatMessage[];
      }>;
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (input: { text: string; files: File[] }) => {
      const formData = new FormData();
      if (input.text) {
        formData.set("text", input.text);
      }
      for (const file of input.files) {
        formData.append("files", file);
      }

      const response = await fetch(
        `/api/public/web-chat/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(automationId)}/messages`,
        {
          method: "POST",
          body: formData,
        },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to send message");
      }

      const body = (await response.json()) as {
        conversation: { id: string };
        message: WebChatMessage;
      };

      const transport = new DefaultChatTransport({
        api: `/api/public/web-chat/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(automationId)}/conversations/${encodeURIComponent(body.conversation.id)}/chat`,
      });
      const chunkStream = await transport.sendMessages({
        abortSignal: new AbortController().signal,
        chatId: body.conversation.id,
        messageId: undefined,
        messages: [
          {
            id: body.message.id,
            role: "user",
            parts: [{ type: "text", text: body.message.text }],
          },
        ],
        trigger: "submit-message",
      });

      let latest = "";
      const messageStream = readUIMessageStream({
        message: { id: `stream-${body.message.id}`, role: "assistant", parts: [] },
        stream: chunkStream,
        terminateOnError: true,
      });
      for await (const nextMessage of messageStream) {
        latest = textFromUiMessage(nextMessage);
        setStreamingText(latest);
      }

      return body;
    },
    onSuccess: async () => {
      setStreamingText("");
      await queryClient.invalidateQueries({
        queryKey: conversationQueryKey(organizationSlug, automationId),
      });
    },
    onError: (error) => {
      setStreamingText("");
      toast.error(
        intl.formatMessage(
          isApiResponseErrorCode(error, "bot_detected")
            ? webChatPageMessages.botBlocked
            : webChatPageMessages.sendError,
        ),
      );
    },
  });

  const messages = conversationQuery.data?.messages ?? [];
  const pendingPreviews = useMemo(
    () =>
      pendingFiles.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [pendingFiles],
  );

  useEffect(() => {
    return () => {
      for (const preview of pendingPreviews) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [pendingPreviews]);

  async function handleSubmit() {
    const text = draft.trim();
    if ((!text && pendingFiles.length === 0) || sendMutation.isPending || !available) {
      return;
    }
    const files = pendingFiles;
    setDraft("");
    setPendingFiles([]);
    await sendMutation.mutateAsync({ text, files });
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 py-6">
      <header className="border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight">{agentName}</h1>
      </header>

      {!available ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <h2 className="text-lg font-medium">
            <FormattedMessage {...webChatPageMessages.unavailableTitle} />
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            <FormattedMessage {...webChatPageMessages.unavailableDescription} />
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-6">
            {conversationQuery.isError ? (
              <p className="text-sm text-destructive">
                <FormattedMessage {...webChatPageMessages.loadError} />
              </p>
            ) : null}
            {messages.length === 0 && !streamingText ? (
              <p className="text-sm text-muted-foreground">
                <FormattedMessage {...webChatPageMessages.emptyState} values={{ name: agentName }} />
              </p>
            ) : null}
            {messages.map((message) => (
              <article
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                  message.senderType === "user"
                    ? "self-end bg-foreground text-background"
                    : "self-start bg-muted text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
                {message.attachments?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.attachments.map((attachment) =>
                      attachment.contentType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={attachment.id}
                          src={attachment.url}
                          alt={attachment.filename}
                          className="max-h-48 rounded-lg"
                        />
                      ) : (
                        <span key={attachment.id}>{attachment.filename}</span>
                      ),
                    )}
                  </div>
                ) : null}
              </article>
            ))}
            {streamingText ? (
              <article className="max-w-[85%] self-start rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
                <p className="whitespace-pre-wrap">{streamingText}</p>
              </article>
            ) : null}
          </div>

          <form
            className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-background pt-4 pb-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            {pendingPreviews.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {pendingPreviews.map((preview) => (
                  <div key={preview.file.name} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview.url}
                      alt={preview.file.name}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="secondary"
                      className="absolute -top-2 -right-2 size-6 rounded-full"
                      aria-label={intl.formatMessage(webChatPageMessages.removeImage, {
                        filename: preview.file.name,
                      })}
                      onClick={() =>
                        setPendingFiles((current) =>
                          current.filter((file) => file !== preview.file),
                        )
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept={[...WEB_CHAT_IMAGE_CONTENT_TYPES].join(",")}
              multiple
              className="sr-only"
              onChange={(event) => {
                const next = [...(event.target.files ?? [])].filter(isAllowedImage);
                event.target.value = "";
                setPendingFiles((current) =>
                  [...current, ...next].slice(0, WEB_CHAT_MAX_IMAGE_FILES),
                );
              }}
            />
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 shrink-0"
                aria-label={intl.formatMessage(webChatPageMessages.attachImage)}
                disabled={sendMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={1.8} className="size-5" />
              </Button>
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={intl.formatMessage(webChatPageMessages.composerPlaceholder)}
                disabled={sendMutation.isPending}
                className="min-h-11 max-h-40 resize-none"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
              />
              <Button
                type="submit"
                size="icon"
                className="size-10 shrink-0"
                disabled={
                  sendMutation.isPending || (!draft.trim() && pendingFiles.length === 0)
                }
                aria-label={intl.formatMessage(
                  sendMutation.isPending ? webChatPageMessages.sending : webChatPageMessages.send,
                )}
              >
                <HugeiconsIcon icon={SentIcon} strokeWidth={1.8} className="size-5" />
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
