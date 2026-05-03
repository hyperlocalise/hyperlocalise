import type { Message } from "chat";

export type EmailAgentIntentKind = "translate" | "check" | "keyword_research" | "unknown";

export type EmailBotState = {
  lastEmailEvent?: {
    senderEmail: string;
    subject: string;
    originalMessageId: string;
  };
  pendingEmailAgentTask?: PendingEmailAgentTask;
  processedEmailAgentTaskKeys?: string[];
};

export type RawEmailMessage = {
  emailId?: string;
  subject?: string;
  messageId?: string;
  to?: string[];
  attachments?: Array<{ id: string; filename: string | null; contentType: string }>;
};

export type PendingEmailAgentTask = {
  kind: "translate";
  requestId: string;
  senderEmail: string;
  subject: string;
  originalMessageId: string;
  emailId: string;
  inboundEmailAddress: string;
  attachments: Array<{ id: string; filename: string | null; contentType: string }>;
  imageAttachments?: Message["attachments"];
  imageMessage?: Message;
  imageRaw?: Pick<RawEmailMessage, "emailId" | "subject" | "messageId">;
  sourceLocale: string | null;
  targetLocale: string | null;
  instructions: string | null;
};
