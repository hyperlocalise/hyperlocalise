"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";

import type { StreamedAssistantMessage } from "./inbox-types";

const streamErrorMessage = "Sorry, I encountered an error while generating a response.";

function createAssistantMessage(id: string, text = ""): UIMessage {
  return {
    id,
    role: "assistant",
    parts: text ? [{ type: "text", text, state: "done" }] : [],
  };
}

export function useConversationStream({
  organizationSlug,
  onStreamFinished,
}: {
  organizationSlug: string;
  onStreamFinished?: () => void | Promise<void>;
}) {
  const [streamedAssistant, setStreamedAssistant] = useState<StreamedAssistantMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const startStreaming = useCallback(
    async (conversationId: string, responseToMessageId: string) => {
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      const messageId = `stream-${responseToMessageId}`;
      abortControllerRef.current = controller;
      setIsStreaming(true);
      setStreamedAssistant({
        conversationId,
        responseToMessageId,
        message: createAssistantMessage(messageId),
        status: "streaming",
      });

      let finishedSuccessfully = false;

      try {
        const transport = new DefaultChatTransport({
          api: `/api/orgs/${organizationSlug}/conversations/${conversationId}/chat`,
          prepareSendMessagesRequest: ({ api, credentials, headers }) => ({
            api,
            credentials,
            headers,
            body: {},
          }),
        });

        const chunkStream = await transport.sendMessages({
          abortSignal: controller.signal,
          chatId: conversationId,
          messageId: undefined,
          messages: [],
          trigger: "submit-message",
        });

        let latestMessage: UIMessage | null = null;
        const messageStream = readUIMessageStream({
          message: createAssistantMessage(messageId),
          stream: chunkStream,
          terminateOnError: true,
        });

        for await (const nextMessage of messageStream) {
          latestMessage = nextMessage;
          setStreamedAssistant({
            conversationId,
            responseToMessageId,
            message: nextMessage,
            status: "streaming",
          });
        }

        finishedSuccessfully = true;
        setStreamedAssistant((current) =>
          current?.conversationId === conversationId &&
          current.responseToMessageId === responseToMessageId
            ? {
                ...current,
                message: latestMessage ?? current.message,
                status: "complete",
              }
            : current,
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("Streaming error:", error);
        setStreamedAssistant({
          conversationId,
          responseToMessageId,
          message: createAssistantMessage(messageId, streamErrorMessage),
          status: "error",
        });
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          setIsStreaming(false);
        }

        if (finishedSuccessfully) {
          await onStreamFinished?.();
        }
      }
    },
    [onStreamFinished, organizationSlug],
  );

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    isStreaming,
    startStreaming,
    stopStreaming,
    streamedAssistant,
  };
}
