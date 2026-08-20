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
    defaultMessage: "No comments or activity yet. Start the discussion.",
    id: "hMCKrgEEKW",
    description: "Empty state when an issue has no comments or activity",
  },
  assignedTo: {
    defaultMessage: "{actor} assigned to {assignee}",
    id: "DtRFjTA7Kk",
    description: "Activity line when an issue is assigned to another user",
  },
  assignedToSelf: {
    defaultMessage: "{actor} assigned to themselves",
    id: "x5jXClnMbS",
    description: "Activity line when an actor assigns an issue to themselves",
  },
  unassigned: {
    defaultMessage: "{actor} unassigned",
    id: "KFoEqCEp2d",
    description: "Activity line when an issue assignee is cleared",
  },
  issueCreated: {
    defaultMessage: "{actor} created the issue",
    id: "Y2hMRmZ+Nf",
    description: "Activity line when an issue is created",
  },
  statusChanged: {
    defaultMessage: "{actor} moved from {previousStatus} to {nextStatus}",
    id: "mWmRyMvedC",
    description: "Activity line when an issue status changes",
  },
  issueTypeChanged: {
    defaultMessage: "{actor} changed type from {previousIssueType} to {nextIssueType}",
    id: "b9pqYzF7KI",
    description: "Activity line when an issue type changes",
  },
  priorityChanged: {
    defaultMessage: "{actor} changed priority from {previousPriority} to {nextPriority}",
    id: "ByKnEF5329",
    description: "Activity line when an issue priority changes",
  },
  prioritySet: {
    defaultMessage: "{actor} set priority to {nextPriority}",
    id: "cVNMp4yAc9",
    description: "Activity line when an issue priority is set for the first time",
  },
  unknownActor: {
    defaultMessage: "Someone",
    id: "hFzuwtEzyB",
    description: "Fallback actor name for issue activity when author is missing",
  },
  routingRecipeApplied: {
    defaultMessage: "Routing recipe {recipeName} applied triage rules",
    id: "yJX381LoRp",
    description: "Activity line when a routing recipe applies on issue create",
  },
  routingSystemActor: {
    defaultMessage: "Routing",
    id: "nTCQOIjDbV",
    description: "Actor label for automated routing recipe activity",
  },
  unknownIssue: {
    defaultMessage: "another issue",
    id: "kBB5urcgnt",
    description: "Fallback name for a related issue when its title isn't available (cross-project)",
  },
  relationshipAddedRelated: {
    defaultMessage: "{actor} related this to {relatedIssue}",
    id: "G1T9+1x7MC",
    description: "Activity line when a related-issue relationship is added",
  },
  relationshipAddedBlocks: {
    defaultMessage: "{actor} marked this as blocking {relatedIssue}",
    id: "jYCKNw+LDl",
    description: "Activity line when a blocks relationship is added",
  },
  relationshipAddedBlockedBy: {
    defaultMessage: "{actor} marked this as blocked by {relatedIssue}",
    id: "yWn40N8bPb",
    description: "Activity line when a blocked-by relationship is added",
  },
  relationshipAddedDuplicateOf: {
    defaultMessage: "{actor} marked this as a duplicate of {relatedIssue}",
    id: "KDIMmNPAxL",
    description: "Activity line when a duplicate_of relationship is added",
  },
  relationshipRemovedRelated: {
    defaultMessage: "{actor} removed the related link to {relatedIssue}",
    id: "psXoqti6i8",
    description: "Activity line when a related-issue relationship is removed",
  },
  relationshipRemovedBlocks: {
    defaultMessage: "{actor} marked this as no longer blocking {relatedIssue}",
    id: "gTVgkDcRK6",
    description: "Activity line when a blocks relationship is removed",
  },
  relationshipRemovedBlockedBy: {
    defaultMessage: "{actor} marked this as no longer blocked by {relatedIssue}",
    id: "DzV7NQXkgD",
    description: "Activity line when a blocked-by relationship is removed",
  },
  relationshipRemovedDuplicateOf: {
    defaultMessage: "{actor} marked this as no longer a duplicate of {relatedIssue}",
    id: "+Qv1Pt0/I9",
    description: "Activity line when a duplicate_of relationship is removed",
  },
  relationshipRemovedDuplicate: {
    defaultMessage: "{actor} unmarked {relatedIssue} as a duplicate of this issue",
    id: "B9k45Fzigm",
    description: "Activity line when the inverse duplicate relationship is removed",
  },
  loadError: {
    defaultMessage: "Could not load comments.",
    id: "f8cyzFEbV0",
    description: "Error when issue comments fail to load",
  },
  loadMore: {
    defaultMessage: "Load more comments",
    id: "ynWaUdVn9j",
    description: "Button to load the next page of issue discussion comments",
  },
  loadingMore: {
    defaultMessage: "Loading…",
    id: "xdQ4upYwW8",
    description: "Button label while more issue comments are loading",
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
    id: "q94QnHzO33",
    description: "Title for the delete issue comment confirmation dialog",
  },
  deleteConfirmDescription: {
    defaultMessage: "This cannot be undone. Any replies to this comment will also be deleted.",
    id: "5mb6txBSWX",
    description: "Description for the delete issue comment confirmation dialog",
  },
  deleteConfirmAction: {
    defaultMessage: "Delete comment",
    id: "ZSs7hAN64v",
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
    id: "0OYYyD2LOl",
    description: "Button to submit a new issue comment",
  },
  replyPlaceholder: {
    defaultMessage: "Reply to {name}…",
    id: "NfaH4ei+PF",
    description: "Placeholder when replying to a specific comment author",
  },
  leaveCommentPlaceholder: {
    defaultMessage: "Leave a comment…",
    id: "8xIDpcJg4F",
    description: "Placeholder for the top-level issue comment composer",
  },
  leaveReplyPlaceholder: {
    defaultMessage: "Leave a reply…",
    id: "D31YyOoRzS",
    description: "Placeholder for the inline reply row on a root comment card",
  },
  editPlaceholder: {
    defaultMessage: "Edit comment…",
    id: "nRQFI6PW+w",
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
