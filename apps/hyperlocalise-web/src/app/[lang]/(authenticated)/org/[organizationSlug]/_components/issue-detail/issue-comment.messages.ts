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

export const issueCommentMessages = defineMessages({
  sectionTitle: {
    defaultMessage: "Comments",
    id: "kbpV8xkMoq",
    description: "Section title for issue discussion comments",
  },
  empty: {
    defaultMessage: "No comments yet. Start the discussion.",
    id: "l4Dmkd+jWE",
    description: "Empty state when an issue has no comments",
  },
  loadError: {
    defaultMessage: "Could not load comments.",
    id: "f8cyzFEbV0",
    description: "Error when issue comments fail to load",
  },
  reply: {
    defaultMessage: "Reply",
    id: "a6vexhfCS6",
    description: "Button to reply to an issue comment",
  },
  edit: {
    defaultMessage: "Edit",
    id: "BxrsOsytU2",
    description: "Button to edit an issue comment",
  },
  delete: {
    defaultMessage: "Delete",
    id: "PFZxqLi3PC",
    description: "Button to delete an issue comment",
  },
  deleteConfirmTitle: {
    defaultMessage: "Delete comment?",
    id: "8qKp2nVxLm",
    description: "Title for the delete issue comment confirmation dialog",
  },
  deleteConfirmDescription: {
    defaultMessage:
      "This cannot be undone. Any replies to this comment will also be deleted.",
    id: "R4mN7wYsHt",
    description: "Description for the delete issue comment confirmation dialog",
  },
  deleteConfirmAction: {
    defaultMessage: "Delete comment",
    id: "pL9vC3xQeA",
    description: "Confirm button to permanently delete an issue comment",
  },
  save: {
    defaultMessage: "Save",
    id: "WGdyHUxjsB",
    description: "Button to save an edited issue comment",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "kjHMR6KKp4",
    description: "Button to cancel editing or replying to a comment",
  },
  send: {
    defaultMessage: "Send",
    id: "TblvRGacjD",
    description: "Button to submit a new issue comment",
  },
  replyPlaceholder: {
    defaultMessage: "Reply to {name}…",
    id: "NfaH4ei+PF",
    description: "Placeholder when replying to a specific comment author",
  },
  leaveCommentPlaceholder: {
    defaultMessage: "Leave a comment…",
    id: "k8Vw2mNpQr",
    description: "Placeholder for the top-level issue comment composer",
  },
  leaveReplyPlaceholder: {
    defaultMessage: "Leave a reply…",
    id: "D31YyOoRzS",
    description: "Placeholder for the inline reply row on a root comment card",
  },
  editPlaceholder: {
    defaultMessage: "Edit comment…",
    id: "tY4Hs9LmXc",
    description: "Placeholder while editing an existing issue comment",
  },
  deleted: {
    defaultMessage: "Comment deleted",
    id: "TDO0IYa70X",
    description: "Toast after deleting an issue comment",
  },
  posted: {
    defaultMessage: "Comment posted",
    id: "CJ1Pudssld",
    description: "Toast after posting an issue comment",
  },
  updated: {
    defaultMessage: "Comment updated",
    id: "TMJ+v5h6o1",
    description: "Toast after updating an issue comment",
  },
  unknownAuthor: {
    defaultMessage: "Unknown",
    id: "2tdCS1JobP",
    description: "Fallback author label when comment author is missing",
  },
});
