"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BubbleChatNotificationIcon,
  FilterMailIcon,
  InboxUnreadIcon,
  MoreHorizontalIcon,
  PreferenceHorizontalIcon,
  TelegramIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  title: string;
  source: "chat_ui" | "email_agent" | "github_agent";
  status: "active" | "archived" | "resolved";
  projectId: string | null;
  lastMessageAt: string;
  createdAt: string;
  lastMessage: {
    text: string;
    senderType: "user" | "agent";
    createdAt: string;
  } | null;
};

type ConversationMessage = {
  id: string;
  conversationId: string;
  senderType: "user" | "agent";
  senderEmail: string | null;
  text: string;
  createdAt: string;
};

type LinkedJob = {
  id: string;
  projectId: string;
  type: "string" | "file";
  status: "queued" | "running" | "succeeded" | "failed";
  outcomeKind: "string_result" | "file_result" | "error" | null;
  createdAt: string;
  completedAt: string | null;
};

const sourceLabel: Record<string, string> = {
  chat_ui: "Chat",
  email_agent: "Email",
  github_agent: "GitHub",
};

const statusStyles = {
  active: "bg-beam-500/14 text-beam-100 ring-beam-500/24",
  archived: "bg-grove-300/14 text-grove-100 ring-grove-300/24",
  resolved: "bg-grove-300/14 text-grove-100 ring-grove-300/24",
};

const jobStatusStyles = {
  queued: "bg-white/6 text-white/52",
  running: "bg-beam-500/14 text-beam-100",
  succeeded: "bg-grove-300/14 text-grove-100",
  failed: "bg-flame-500/14 text-flame-100",
};

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString();
}

export function InboxPageContent({ organizationSlug }: { organizationSlug: string }) {
  const router = useRouter();
  const params = useParams();
  const urlConversationId = params?.conversationId as string | undefined;

  const conversationsQuery = useQuery({
    queryKey: ["conversations", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].conversations.$get({
        param: { organizationSlug },
        query: { limit: "50" },
      });
      if (!response.ok) throw new Error("Failed to load conversations");
      return (await response.json()) as { conversations: Conversation[] };
    },
  });

  const conversations = conversationsQuery.data?.conversations ?? [];
  const selectedConversationId = urlConversationId ?? conversations[0]?.id ?? "";
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return { messages: [] as ConversationMessage[] };
      const response = await apiClient.api.orgs[":organizationSlug"].conversations[
        ":conversationId"
      ].messages.$get({
        param: { organizationSlug, conversationId: selectedConversationId },
      });
      if (!response.ok) throw new Error("Failed to load messages");
      return (await response.json()) as { messages: ConversationMessage[] };
    },
    enabled: !!selectedConversationId,
  });

  const jobsQuery = useQuery({
    queryKey: ["conversation-jobs", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return { jobs: [] as LinkedJob[] };
      const response = await apiClient.api.orgs[":organizationSlug"].conversations[
        ":conversationId"
      ].jobs.$get({
        param: { organizationSlug, conversationId: selectedConversationId },
      });
      if (!response.ok) throw new Error("Failed to load jobs");
      return (await response.json()) as { jobs: LinkedJob[] };
    },
    enabled: !!selectedConversationId,
  });

  const messages = messagesQuery.data?.messages ?? [];
  const jobs = jobsQuery.data?.jobs ?? [];

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].conversations[
        ":conversationId"
      ].messages.$post({
        param: { organizationSlug, conversationId: selectedConversationId },
        json: { text },
      });
      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: () => {
      void messagesQuery.refetch();
      void conversationsQuery.refetch();
    },
  });

  const [replyText, setReplyText] = useState("");
  const isChatUi = selectedConversation?.source === "chat_ui";

  const unreadCount = useMemo(
    () => conversations.filter((c) => c.status === "active").length,
    [conversations],
  );

  return (
    <main
      data-organization={organizationSlug}
      className="-mx-4 -my-5 min-h-[calc(100svh-3.5rem)] overflow-hidden bg-[#0b0b0d] text-white sm:-mx-6 lg:-mx-8"
    >
      <div className="grid min-h-[calc(100svh-3.5rem)] grid-cols-1 lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]">
        {/* Left panel — Inbox list */}
        <section className="flex min-h-[34rem] flex-col border-white/8 lg:border-r">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/8 px-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-white/6 text-white/82">
                <HugeiconsIcon icon={InboxUnreadIcon} strokeWidth={1.8} className="size-5" />
              </div>
              <div>
                <h1 className="font-heading text-lg font-semibold tracking-normal">Inbox</h1>
                <p className="text-xs text-white/42">{unreadCount} active conversations</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-white/52 hover:bg-white/8 hover:text-white"
                aria-label="Filter inbox"
              >
                <HugeiconsIcon icon={FilterMailIcon} strokeWidth={1.8} className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-white/52 hover:bg-white/8 hover:text-white"
                aria-label="Inbox display settings"
              >
                <HugeiconsIcon
                  icon={PreferenceHorizontalIcon}
                  strokeWidth={1.8}
                  className="size-4"
                />
              </Button>
            </div>
          </header>

          <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
            <Badge variant="outline" className="border-white/10 bg-white/6 text-white/76">
              All
            </Badge>
            <Badge variant="ghost" className="text-white/46">
              Active
            </Badge>
            <Badge variant="ghost" className="text-white/46">
              Resolved
            </Badge>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {conversationsQuery.isLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3 rounded-lg px-3 py-3">
                    <Skeleton className="size-10 shrink-0 rounded-full bg-white/6" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4 bg-white/6" />
                      <Skeleton className="h-3 w-1/2 bg-white/6" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversationsQuery.isError ? (
              <p className="px-3 py-4 text-sm text-white/42">Unable to load conversations.</p>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-4 text-sm text-white/42">No conversations yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {conversations.map((item) => {
                  const isSelected = item.id === selectedConversationId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => router.push(`/org/${organizationSlug}/inbox/${item.id}`)}
                      className={cn(
                        "grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                        isSelected
                          ? "bg-white/10 text-white"
                          : "text-white/76 hover:bg-white/6 hover:text-white",
                      )}
                    >
                      <Avatar className="bg-white/7">
                        <AvatarFallback className="bg-white/8 text-xs font-medium text-white/78">
                          {sourceLabel[item.source]?.[0] ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                        </div>
                        <p className="mt-1 truncate text-sm text-white/45">
                          {item.lastMessage?.text ?? "No messages yet"}
                        </p>
                        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-white/34">
                          <span className="truncate">
                            {sourceLabel[item.source] ?? item.source}
                          </span>
                          <span className="size-1 rounded-full bg-white/18" />
                          <span>{formatRelativeTime(item.lastMessageAt)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right side — Chat detail + right panel */}
        <section className="min-h-0 bg-[#101012]">
          {!selectedConversation ? (
            <div className="flex h-full items-center justify-center text-white/42">
              <p>Select a conversation to view details</p>
            </div>
          ) : (
            <>
              <header className="flex h-16 items-center justify-between border-b border-white/8 px-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <HugeiconsIcon
                    icon={BubbleChatNotificationIcon}
                    strokeWidth={1.8}
                    className="size-5"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white/42">
                      {sourceLabel[selectedConversation.source] ?? selectedConversation.source}
                    </p>
                    <h2 className="truncate font-heading text-base font-semibold">
                      {selectedConversation.title}
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-white/52 hover:bg-white/8 hover:text-white"
                    aria-label="More inbox item actions"
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} className="size-4" />
                  </Button>
                </div>
              </header>

              <div className="grid min-h-[calc(100svh-7.5rem)] gap-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
                {/* Center — Chat messages */}
                <div className="flex min-h-0 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                    {messagesQuery.isLoading ? (
                      <div className="space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex gap-3">
                            <Skeleton className="size-8 shrink-0 rounded-full bg-white/6" />
                            <div className="min-w-0 flex-1 space-y-2">
                              <Skeleton className="h-4 w-24 bg-white/6" />
                              <Skeleton className="h-3 w-full bg-white/6" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : messages.length === 0 ? (
                      <p className="text-sm text-white/42">No messages yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              "flex gap-3",
                              msg.senderType === "user" ? "flex-row" : "flex-row-reverse",
                            )}
                          >
                            <Avatar className="size-8 shrink-0 bg-white/7">
                              <AvatarFallback className="bg-white/8 text-[10px] font-medium text-white/78">
                                {msg.senderType === "user" ? "U" : "A"}
                              </AvatarFallback>
                            </Avatar>
                            <div
                              className={cn(
                                "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-6",
                                msg.senderType === "user"
                                  ? "bg-white/10 text-white/88"
                                  : "bg-dew-500/10 text-white/88",
                              )}
                            >
                              <p className="whitespace-pre-wrap">{msg.text}</p>
                              <p className="mt-1 text-[10px] text-white/34">
                                {formatRelativeTime(msg.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {isChatUi && (
                    <section className="border-t border-white/8 px-4 py-4 sm:px-6">
                      <div className="flex items-end gap-2">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (replyText.trim()) {
                                sendMessageMutation.mutate(replyText.trim());
                                setReplyText("");
                              }
                            }
                          }}
                          className="min-h-12 w-full resize-none rounded-lg bg-white/5 px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-white/28 focus:ring-white/20"
                          placeholder="Type a message..."
                          rows={1}
                        />
                        <Button
                          type="button"
                          size="icon-sm"
                          disabled={!replyText.trim() || sendMessageMutation.isPending}
                          onClick={() => {
                            if (replyText.trim()) {
                              sendMessageMutation.mutate(replyText.trim());
                              setReplyText("");
                            }
                          }}
                          className="shrink-0 bg-white text-[#101012] hover:bg-white/86"
                        >
                          <HugeiconsIcon icon={TelegramIcon} strokeWidth={1.8} className="size-4" />
                        </Button>
                      </div>
                    </section>
                  )}
                </div>

                {/* Right panel — Details & linked jobs */}
                <aside className="border-t border-white/8 px-4 py-5 xl:border-t-0 xl:border-l xl:px-5">
                  <section className="pb-5">
                    <h3 className="text-sm font-medium text-white/84">Details</h3>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-white/40">Source</dt>
                        <dd className="text-white/76">
                          {sourceLabel[selectedConversation.source] ?? selectedConversation.source}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-white/40">Status</dt>
                        <dd>
                          <Badge
                            className={cn("ring-1", statusStyles[selectedConversation.status])}
                          >
                            {selectedConversation.status}
                          </Badge>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-white/40">Created</dt>
                        <dd className="text-white/76">
                          {new Date(selectedConversation.createdAt).toLocaleDateString()}
                        </dd>
                      </div>
                      {selectedConversation.projectId && (
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-white/40">Project</dt>
                          <dd className="text-white/76">{selectedConversation.projectId}</dd>
                        </div>
                      )}
                    </dl>
                  </section>

                  <section className="border-t border-white/8 pt-5">
                    <h3 className="text-sm font-medium text-white/84">Linked Jobs</h3>
                    {jobsQuery.isLoading ? (
                      <div className="mt-4 space-y-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full bg-white/6" />
                        ))}
                      </div>
                    ) : jobs.length === 0 ? (
                      <p className="mt-4 text-sm text-white/42">
                        No jobs linked to this conversation.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {jobs.map((job) => (
                          <a
                            key={job.id}
                            href={`/org/${organizationSlug}/jobs`}
                            className="block rounded-lg border border-white/8 bg-white/4 px-3 py-2.5 transition-colors hover:bg-white/7"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium text-white/80">
                                {job.id}
                              </span>
                              <Badge className={cn("text-[10px]", jobStatusStyles[job.status])}>
                                {job.status}
                              </Badge>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-white/42">
                              <span className="uppercase">{job.type}</span>
                              <span className="size-1 rounded-full bg-white/18" />
                              <span>{formatRelativeTime(job.createdAt)}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
