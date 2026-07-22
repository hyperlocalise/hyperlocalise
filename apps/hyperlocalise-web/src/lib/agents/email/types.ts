/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
  headers?: Record<string, string>;
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
