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
import type { UIMessage } from "ai";

export type InboxChatStatusData = {
  message: string;
};

export type InboxChatToolProgressData = {
  toolCallId: string;
  message: string;
};

/** The agent needs one answer before it can go on; the chat offers the options as buttons. */
export type InboxChatClarificationData = {
  question: string;
  options: string[];
};

/** The user stopped the turn; the parts before this one are what the agent had produced. */
export type InboxChatInterruptedData = {
  reason: "user_cancelled";
};

/** The tool result in this message is a shortened copy; the full one loads on request. */
export type InboxChatToolOutputTruncatedData = {
  toolCallId: string;
  omitted: number;
};

export type InboxChatDataTypes = {
  status: InboxChatStatusData;
  toolProgress: InboxChatToolProgressData;
  clarification: InboxChatClarificationData;
  interrupted: InboxChatInterruptedData;
  toolOutputTruncated: InboxChatToolOutputTruncatedData;
};

/** Data parts that stay in the stored message. Status and progress parts only matter live. */
export const PERSISTED_INBOX_CHAT_DATA_PART_TYPES: ReadonlySet<string> = new Set([
  "data-clarification",
  "data-interrupted",
  "data-toolOutputTruncated",
]);

export type InboxChatUIMessage = UIMessage<never, InboxChatDataTypes>;
