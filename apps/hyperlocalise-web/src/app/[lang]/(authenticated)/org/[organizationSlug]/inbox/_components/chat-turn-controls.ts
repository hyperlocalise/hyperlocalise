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
/** A follow-up waiting for the agent's current turn, as the composer shows it. */
export type QueuedChatMessageView = {
  id: string;
  text: string;
  fileCount: number;
};

/** Controls for the agent turn that is running in a conversation. */
export type ChatTurnControls = {
  /** The user asked to stop and the server has not ended the turn yet. */
  isStopping: boolean;
  onStop: () => void;
  queuedMessages: QueuedChatMessageView[];
  onRemoveQueuedMessage: (messageId: string) => void;
  /** Takes the message out of the queue and puts its text back in the composer. */
  onEditQueuedMessage: (messageId: string) => void;
};
