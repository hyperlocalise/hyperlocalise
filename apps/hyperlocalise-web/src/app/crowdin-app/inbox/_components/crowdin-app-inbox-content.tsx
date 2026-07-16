"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage } from "react-intl";
import { observer } from "mobx-react-lite";

import { InboxPageView } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/inbox-page-view";
import type {
  InboxCurrentUser,
  StreamedAssistantMessage,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/inbox-types";
import { ChatStreamManager } from "@/components/app-shell/chat-dock/chat-stream-manager";
import { ChatDockStore } from "@/components/app-shell/chat-dock/chat-dock-store";
import { Button } from "@/components/ui/button";
import { CROWDIN_EMBED_SESSION_HEADER } from "@/lib/crowdin-app/embed-session";

import {
  bootstrapCrowdinAppSession,
  createCrowdinAppInboxApi,
  type CrowdinAppSessionResponse,
} from "./crowdin-app-inbox-api";
import { crowdinAppInboxMessages } from "./crowdin-app-inbox.messages";
import {
  CrowdinAppInboxErrorState,
  CrowdinAppInboxLoading,
  type CrowdinAppInboxErrorCode,
} from "./crowdin-app-inbox-state";

function conversationsQueryKey(organizationSlug: string, projectId: string) {
  return ["crowdin-app-conversations", organizationSlug, projectId] as const;
}

function messagesQueryKey(conversationId: string) {
  return ["crowdin-app-messages", conversationId] as const;
}

function jobsQueryKey(conversationId: string) {
  return ["crowdin-app-jobs", conversationId] as const;
}

const CrowdinAppInboxReady = observer(function CrowdinAppInboxReady({
  session,
  appBaseUrl,
}: {
  session: CrowdinAppSessionResponse["session"];
  appBaseUrl: string;
}) {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [store] = useState(() => new ChatDockStore());
  const streamManager = useMemo(
    () =>
      new ChatStreamManager(session.organizationSlug, store, {
        headers: {
          [CROWDIN_EMBED_SESSION_HEADER]: session.embedToken,
        },
      }),
    [session.embedToken, session.organizationSlug, store],
  );
  const api = useMemo(() => createCrowdinAppInboxApi(session.embedToken), [session.embedToken]);

  const currentUser = useMemo<InboxCurrentUser>(
    () => ({
      avatarUrl: null,
      email: session.user.email,
      name: session.user.email,
    }),
    [session.user.email],
  );

  const conversationsQuery = useQuery({
    queryKey: conversationsQueryKey(session.organizationSlug, session.projectId),
    queryFn: () => api.listConversations(session.organizationSlug, session.projectId),
  });

  const conversations = conversationsQuery.data ?? [];
  const effectiveConversationId = selectedConversationId || conversations[0]?.id || "";
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === effectiveConversationId),
    [conversations, effectiveConversationId],
  );

  const messagesQuery = useQuery({
    queryKey: messagesQueryKey(effectiveConversationId),
    queryFn: () => api.listMessages(session.organizationSlug, effectiveConversationId),
    enabled: Boolean(effectiveConversationId),
  });

  const jobsQuery = useQuery({
    queryKey: jobsQueryKey(effectiveConversationId),
    queryFn: () => api.listLinkedJobs(session.organizationSlug, effectiveConversationId),
    enabled: Boolean(effectiveConversationId),
  });

  const streamSnapshot = effectiveConversationId
    ? streamManager.getSnapshot(effectiveConversationId)
    : null;
  const isStreaming = Boolean(
    effectiveConversationId &&
    (streamManager.isStreaming(effectiveConversationId) || streamSnapshot?.status === "streaming"),
  );
  const streamedAssistant: StreamedAssistantMessage | null = streamSnapshot
    ? {
        conversationId: streamSnapshot.conversationId,
        responseToMessageId: streamSnapshot.responseToMessageId,
        message: streamSnapshot.message,
        status: streamSnapshot.status,
      }
    : null;

  useEffect(() => {
    streamManager.setOnStreamFinished(async (conversationId) => {
      await queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId) });
      await queryClient.invalidateQueries({
        queryKey: conversationsQueryKey(session.organizationSlug, session.projectId),
      });
      store.clearStreamSnapshot(conversationId);
    });
    return () => {
      streamManager.setOnStreamFinished(null);
      streamManager.stopAll();
    };
  }, [queryClient, session.organizationSlug, session.projectId, store, streamManager]);

  const createConversationMutation = useMutation({
    mutationFn: (input: { text: string; files: File[] }) =>
      api.createConversation(session.organizationSlug, {
        ...input,
        projectId: session.projectId,
      }),
  });

  const sendMessageMutation = useMutation({
    mutationFn: (input: { text: string; files: File[] }) =>
      api.sendMessage(session.organizationSlug, effectiveConversationId, {
        ...input,
        projectId: session.projectId,
      }),
  });

  const onSendMessage = useCallback(
    async (text: string, files: File[]) => {
      if (!effectiveConversationId) {
        const created = await createConversationMutation.mutateAsync({ text, files });
        setSelectedConversationId(created.conversation.id);
        await queryClient.invalidateQueries({
          queryKey: conversationsQueryKey(session.organizationSlug, session.projectId),
        });
        return;
      }

      await sendMessageMutation.mutateAsync({ text, files });
      await queryClient.invalidateQueries({
        queryKey: messagesQueryKey(effectiveConversationId),
      });
      await queryClient.invalidateQueries({
        queryKey: conversationsQueryKey(session.organizationSlug, session.projectId),
      });
    },
    [
      createConversationMutation,
      effectiveConversationId,
      queryClient,
      sendMessageMutation,
      session.organizationSlug,
      session.projectId,
    ],
  );

  const messages = messagesQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const lastMessage = messages.at(-1);
  const isSparseInbox = !conversationsQuery.isLoading && conversations.length <= 1;

  const autoTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !effectiveConversationId ||
      !messagesQuery.isSuccess ||
      lastMessage?.senderType !== "user" ||
      streamManager.isStreaming(effectiveConversationId) ||
      autoTriggeredRef.current === lastMessage.id
    ) {
      return;
    }

    autoTriggeredRef.current = lastMessage.id;
    void streamManager.start({
      conversationId: effectiveConversationId,
      responseToMessageId: lastMessage.id,
      text: lastMessage.text,
    });
  }, [
    effectiveConversationId,
    lastMessage?.id,
    lastMessage?.senderType,
    lastMessage?.text,
    messagesQuery.isSuccess,
    streamManager,
  ]);

  const deepLink = effectiveConversationId
    ? `${appBaseUrl}/org/${session.organizationSlug}/inbox/${effectiveConversationId}`
    : `${appBaseUrl}/org/${session.organizationSlug}/inbox`;

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Hyperlocalise</p>
          <p className="truncate text-xs text-muted-foreground">
            <FormattedMessage
              {...crowdinAppInboxMessages.projectLabel}
              values={{ projectName: session.projectName }}
            />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelectedConversationId("")}
          >
            <FormattedMessage {...crowdinAppInboxMessages.newConversation} />
          </Button>
          <Button
            nativeButton={false}
            render={<a href={deepLink} rel="noreferrer" target="_blank" />}
            size="sm"
            variant="ghost"
          >
            <FormattedMessage {...crowdinAppInboxMessages.openInHyperlocalise} />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <InboxPageView
          conversations={conversations}
          conversationsIsError={conversationsQuery.isError}
          conversationsIsLoading={conversationsQuery.isLoading}
          currentUser={currentUser}
          isSending={createConversationMutation.isPending || sendMessageMutation.isPending}
          isSparseInbox={isSparseInbox}
          isStreaming={isStreaming}
          jobs={jobs}
          jobsIsLoading={jobsQuery.isLoading}
          messages={messages}
          messagesIsLoading={messagesQuery.isLoading}
          onSelectConversation={setSelectedConversationId}
          onSendMessage={onSendMessage}
          organizationSlug={session.organizationSlug}
          selectedConversation={selectedConversation}
          selectedConversationId={effectiveConversationId}
          streamedAssistant={streamedAssistant}
        />
      </div>
    </div>
  );
});

export function CrowdinAppInboxContent({
  jwtToken,
  appBaseUrl,
}: {
  jwtToken: string | null;
  appBaseUrl: string;
}) {
  const [session, setSession] = useState<CrowdinAppSessionResponse["session"] | null>(null);
  const [error, setError] = useState<CrowdinAppInboxErrorCode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const iframeSrc =
      process.env.NEXT_PUBLIC_CROWDIN_IFRAME_SRC ?? "https://cdn.crowdin.com/apps/dist/iframe.js";
    if (typeof document === "undefined") {
      return;
    }
    if (document.querySelector(`script[src="${iframeSrc}"]`)) {
      return;
    }
    const script = document.createElement("script");
    script.src = iframeSrc;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!jwtToken) {
        setError("unauthorized");
        setLoading(false);
        return;
      }

      try {
        const result = await bootstrapCrowdinAppSession(jwtToken);
        if (!cancelled) {
          setSession(result.session);
          setError(null);
        }
      } catch (bootstrapError) {
        if (!cancelled) {
          const code =
            bootstrapError instanceof Error
              ? (bootstrapError.message as CrowdinAppInboxErrorCode)
              : "unauthorized";
          setError(code);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [jwtToken]);

  if (loading) {
    return <CrowdinAppInboxLoading />;
  }

  if (error || !session) {
    return <CrowdinAppInboxErrorState appBaseUrl={appBaseUrl} error={error ?? "unauthorized"} />;
  }

  return <CrowdinAppInboxReady appBaseUrl={appBaseUrl} session={session} />;
}
