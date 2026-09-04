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

export const inboxNotificationsMessages = defineMessages({
  markAllRead: {
    defaultMessage: "Mark all as read",
    id: "D622LHuyX8",
    description: "Button to mark all issue notifications as read in the inbox list",
  },
  empty: {
    defaultMessage: "No conversations or notifications yet.",
    id: "r0gMCcsbGC",
    description: "Empty state when the inbox has neither conversations nor notifications",
  },
  loadError: {
    defaultMessage: "Unable to load inbox.",
    id: "wYA642IjdA",
    description: "Error when the unified inbox list fails to load",
  },
  assigned: {
    defaultMessage: "{actor} assigned you to {issueTitle}",
    id: "517eSE0isf",
    description: "Inbox notification preview for issue assignment",
  },
  mentioned: {
    defaultMessage: "{actor} mentioned you on {issueTitle}",
    id: "NBzsgyShMP",
    description: "Inbox notification preview for a mention",
  },
  comment: {
    defaultMessage: "{actor} commented on {issueTitle}",
    id: "YxgRjdqpTS",
    description: "Inbox notification preview for a comment on a watched issue",
  },
  statusChanged: {
    defaultMessage: "{actor} changed status of {issueTitle}",
    id: "PVpHHcgxIZ",
    description: "Inbox notification preview for an issue status change",
  },
  assigneeChanged: {
    defaultMessage: "{actor} changed assignee on {issueTitle}",
    id: "H/zIVmChfF",
    description: "Inbox notification preview for an assignee change",
  },
  someone: {
    defaultMessage: "Someone",
    id: "6N3tTQGcSO",
    description: "Fallback actor name when notification actor is missing",
  },
  issueNotification: {
    defaultMessage: "Issue",
    id: "Vm1k8EkL8L",
    description: "Source label for issue notification rows in the inbox list",
  },
  assignedType: {
    defaultMessage: "Assignment",
    id: "Y+HVGLFFig",
    description: "Short label for assignment notification type icon in the inbox list",
  },
  mentionedType: {
    defaultMessage: "Mention",
    id: "TE4yzOvouE",
    description: "Short label for mention notification type icon in the inbox list",
  },
  commentType: {
    defaultMessage: "Comment",
    id: "xz22Pvfb9j",
    description: "Short label for comment notification type icon in the inbox list",
  },
  statusChangedType: {
    defaultMessage: "Status change",
    id: "/xLTphGoSI",
    description: "Short label for status-change notification type icon in the inbox list",
  },
  assigneeChangedType: {
    defaultMessage: "Assignee change",
    id: "IHSPoPMGG7",
    description: "Short label for assignee-change notification type icon in the inbox list",
  },
  issuePanelLoading: {
    defaultMessage: "Loading issue",
    id: "EOpyg02xLN",
    description: "Aria label while issue detail loads in the inbox panel",
  },
  issuePanelNotFound: {
    defaultMessage: "This issue is unavailable.",
    id: "7M/8dl8Baw",
    description: "Shown when a selected notification issue cannot be loaded",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "J9Nh4r/Fsj",
    description: "Button to load older issue notifications in the inbox list",
  },
});
