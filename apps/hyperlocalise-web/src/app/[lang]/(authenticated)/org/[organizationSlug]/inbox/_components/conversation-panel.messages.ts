"use client";

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
