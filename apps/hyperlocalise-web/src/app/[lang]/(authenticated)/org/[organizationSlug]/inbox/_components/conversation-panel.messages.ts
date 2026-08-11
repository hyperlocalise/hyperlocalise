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
import { defineMessages } from "react-intl";

export const conversationPanelMessages = defineMessages({
  selectConversation: {
    defaultMessage: "Select a conversation to view details",
    id: "iUA2MassCX",
    description: "Empty state when no inbox conversation is selected",
  },
  createdAt: {
    defaultMessage: "Created {relativeTime}",
    id: "oKnUPzABxE",
    description: "Conversation header line showing when the conversation was created",
  },
  checkingLinkedJobs: {
    defaultMessage: "Checking linked jobs",
    id: "fyUzKxz7yZ",
    description: "Conversation header status while linked jobs are loading",
  },
  linkedJobsCount: {
    defaultMessage: "{count, plural, one {# linked job} other {# linked jobs}}",
    id: "XnPJMbtciR",
    description: "Conversation header count of jobs linked to the conversation",
  },
});
