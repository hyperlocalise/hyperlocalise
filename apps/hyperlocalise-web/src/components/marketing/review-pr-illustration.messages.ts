"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const reviewPrIllustrationMessages = defineMessages({
  prSubtitle: {
    defaultMessage: "review translation updates",
    id: "SUOtzGbVxd",
    description: "Subtitle under the file path in the review PR illustration",
  },
  summaryDraft: {
    defaultMessage: "3 strings changed, 1 translation issue called out before merge",
    id: "wB36ZpuzG3",
    description: "PR summary shown before the agent fix in the review PR illustration",
  },
  summaryResolved: {
    defaultMessage: "3 strings changed, 1 French typo corrected directly from the PR thread",
    id: "w79MA47tly",
    description: "PR summary shown after the agent fix in the review PR illustration",
  },
  statusReviewRequired: {
    defaultMessage: "Review required",
    id: "khjY0ZK7/t",
    description: "Status badge when review is still needed in the PR illustration",
  },
  statusAgentFixing: {
    defaultMessage: "Agent fixing",
    id: "IC06cS9nUd",
    description: "Status badge while the agent is fixing the translation",
  },
  statusChangesCommitted: {
    defaultMessage: "Changes committed",
    id: "q9qDjh4G/B",
    description: "Status badge after the agent commits the fix",
  },
  columnOld: {
    defaultMessage: "Old",
    id: "C5fqvIk+YX",
    description: "Diff column header for old lines in the review PR illustration",
  },
  columnNew: {
    defaultMessage: "New",
    id: "VTbT3F0x5H",
    description: "Diff column header for new lines in the review PR illustration",
  },
  columnDiff: {
    defaultMessage: "Diff",
    id: "fF31f5m0dZ",
    description: "Diff column header for the code column in the review PR illustration",
  },
  commentOnLine: {
    defaultMessage: "Comment on line <line></line>",
    id: "P5XQbf/8AX",
    description: "Header for a review comment anchored to a diff line",
  },
  resolvedBadge: {
    defaultMessage: "Resolved",
    id: "RsKDuqSmvu",
    description: "Badge shown when a PR review thread is resolved",
  },
  logoAlt: {
    defaultMessage: "Hyperlocalise logo",
    id: "CrBQt1oY62",
    description: "Alt text for the Hyperlocalise avatar in the review PR illustration",
  },
  requestedChanges: {
    defaultMessage: "requested changes",
    id: "lalUtB4BvL",
    description: "Action text next to Hyperlocalise when requesting changes on a PR",
  },
  reviewTitle: {
    defaultMessage: "Missing accent changes the French noun",
    id: "AARt6Fk4fm",
    description: "Title of the review finding in the PR illustration mock comment",
  },
  reviewBody: {
    defaultMessage:
      "French requires “marchés” with an acute accent. Without it, the line reads like the verb “marches” instead of “markets” in customer-facing pricing copy.",
    id: "Io0khnUDZT",
    description: "Body of the review finding in the PR illustration mock comment",
  },
  mentionHint: {
    defaultMessage: "Mention Hyperlocalise to patch the diff in-thread.",
    id: "qHfdi/GpQK",
    description: "Hint under the comment composer in the review PR illustration",
  },
  commentButton: {
    defaultMessage: "Comment",
    id: "aRsl7fqj3D",
    description: "Button to submit the mock PR comment in the review illustration",
  },
  isReplying: {
    defaultMessage: "is replying",
    id: "7bYNDVM57F",
    description: "Status text while Hyperlocalise is replying in the PR thread",
  },
  resolvedTheThread: {
    defaultMessage: "resolved the thread",
    id: "0oWOPc6WxE",
    description: "Status text after Hyperlocalise resolves the PR thread",
  },
  fixingTitle: {
    defaultMessage: "Fixing",
    id: "gws2JgYaNJ",
    description: "Title shown while the agent is applying a fix in the PR thread",
  },
  fixingBody: {
    defaultMessage: "Updating the string to use the correct accented French noun.",
    id: "mHk95Qw98g",
    description: "Body shown while the agent is applying a fix in the PR thread",
  },
  fixedTitle: {
    defaultMessage: "Fixed and committed to this branch.",
    id: "1X7DOlRyIy",
    description: "Success title after the agent commits the PR fix",
  },
  fixedBody: {
    defaultMessage:
      "Replaced <wrong>marches</wrong> with <right>marchés</right> so the French pricing copy is spelled correctly.",
    id: "HA9fSDFTe4",
    description: "Success body after the agent commits the PR fix, wrapping code examples",
  },
  resetButton: {
    defaultMessage: "Reset",
    id: "vyiCHg90XK",
    description: "Button to reset the interactive review PR illustration",
  },
  fixingDotTitle: {
    defaultMessage: "Fixing",
    id: "UbVHwBap7q",
    description: "Dot-flow animation title while fixing in the review PR illustration",
  },
});
