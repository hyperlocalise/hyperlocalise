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
import type { ChatTurnControls } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/chat-turn-controls";

import type { ChatDockStore } from "./chat-dock-store";
import type { ChatStreamManager } from "./chat-stream-manager";

/**
 * Stop and queue controls for one conversation's running turn, read from the shared dock store
 * so the dock and the inbox show the same queue. Call from an observer component.
 */
export function buildChatTurnControls(input: {
  conversationId: string;
  store: ChatDockStore;
  streamManager: ChatStreamManager;
  /** Puts an edited queued message's text back in the composer. */
  onEditText: (text: string) => void;
  onStopFailed: () => void;
}): ChatTurnControls {
  const { conversationId, store, streamManager } = input;

  return {
    isStopping: store.isStopping(conversationId),
    onStop: () => {
      streamManager.cancel(conversationId).catch(input.onStopFailed);
    },
    queuedMessages: store.getQueuedMessages(conversationId).map((message) => ({
      id: message.id,
      text: message.text,
      fileCount: message.files.length,
    })),
    onRemoveQueuedMessage: (messageId) => {
      store.removeQueuedMessage(conversationId, messageId);
    },
    onEditQueuedMessage: (messageId) => {
      const message = store.removeQueuedMessage(conversationId, messageId);
      if (message) {
        input.onEditText(message.text);
      }
    },
  };
}
