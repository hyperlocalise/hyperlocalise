import type { UIMessage } from "ai";

export type Conversation = {
  id: string;
  title: string;
  source: "chat_ui" | "email_agent" | "github_agent";
  status: "active" | "archived";
  projectId: string | null;
  lastMessageAt: string;
  createdAt: string;
  lastMessage: {
    text: string;
    senderType: "user" | "agent";
    createdAt: string;
  } | null;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderType: "user" | "agent";
  senderEmail: string | null;
  text: string;
  attachments: Array<{ id: string; filename: string; contentType: string; url: string }> | null;
  createdAt: string;
};

export type LinkedJob = {
  id: string;
  projectId: string;
  type: "string" | "file";
  status: "queued" | "running" | "succeeded" | "failed";
  outcomeKind: "string_result" | "file_result" | "error" | null;
  createdAt: string;
  completedAt: string | null;
};

export type StreamedAssistantMessage = {
  conversationId: string;
  responseToMessageId: string;
  message: UIMessage;
  status: "streaming" | "complete" | "error";
};

export type InboxCurrentUser = {
  avatarUrl: string | null;
  email: string;
  name: string;
};

export const sourceLabel: Record<Conversation["source"], string> = {
  chat_ui: "Chat",
  email_agent: "Email",
  github_agent: "GitHub",
};

export const statusStyles: Record<Conversation["status"], string> = {
  active: "bg-beam-500/14 text-beam-100 ring-beam-500/24",
  archived: "bg-grove-300/14 text-grove-100 ring-grove-300/24",
};

export const jobStatusStyles: Record<LinkedJob["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-beam-500/14 text-beam-100",
  succeeded: "bg-grove-300/14 text-grove-100",
  failed: "bg-flame-500/14 text-flame-100",
};

export function formatRelativeTime(value: string | Date | null) {
  if (!value) return "n/a";

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "n/a";

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString();
}
