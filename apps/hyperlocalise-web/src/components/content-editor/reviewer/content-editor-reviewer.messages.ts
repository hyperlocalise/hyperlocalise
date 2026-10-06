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

export const contentEditorReviewerMessages = defineMessages({
  bulkBarLabel: {
    defaultMessage: "Bulk review actions",
    id: "qYJlcc1lPn",
    description: "Accessible label for the persistent bulk action bar in the Reviewer workspace",
  },
  selectAllVisibleAria: {
    defaultMessage: "Select all loaded strings",
    id: "QL4/TrmCWL",
    description: "Accessible label for the select-all checkbox in the Reviewer bulk action bar",
  },
  selectedCount: {
    defaultMessage: "{count, plural, =0 {No strings selected} one {# selected} other {# selected}}",
    id: "U6TVC7w8/h",
    description: "Number of selected strings shown in the Reviewer bulk action bar",
  },
  approveSelected: {
    defaultMessage: "Approve",
    id: "8x4ozGQdo+",
    description: "Reviewer bulk action bar button that approves all selected strings",
  },
  skipSelected: {
    defaultMessage: "Skip",
    id: "GnocW1/sB7",
    description: "Reviewer bulk action bar button that skips all selected strings",
  },
  clearSelection: {
    defaultMessage: "Clear",
    id: "E362OwvbM2",
    description: "Reviewer bulk action bar button that clears the current selection",
  },
  moreActionsAria: {
    defaultMessage: "More bulk actions",
    id: "hVBnZuKLsG",
    description: "Accessible label for the overflow menu in the Reviewer bulk action bar",
  },
  quickApproveAria: {
    defaultMessage: "Approve string {key}",
    id: "OkSRmb3Xg1",
    description: "Accessible label for the inline approve button on a Reviewer row",
  },
  quickSkipAria: {
    defaultMessage: "Skip string {key}",
    id: "2csSZlQVzp",
    description: "Accessible label for the inline skip button on a Reviewer row",
  },
  issueBadge: {
    defaultMessage: "QA issue",
    id: "Vl/U4h6KBS",
    description: "Badge on a Reviewer row that has an open issue or a failed QA check",
  },
  statusTotal: {
    defaultMessage: "{count, plural, one {#{more} string} other {#{more} strings}}",
    id: "da0rYutiyt",
    description:
      "Reviewer status bar: number of loaded strings. {more} is '+' when more pages can load",
  },
  statusReviewed: {
    defaultMessage: "{count} reviewed",
    id: "O16YMX8TPk",
    description: "Reviewer status bar: number of loaded strings that are reviewed",
  },
  statusNeedsReview: {
    defaultMessage: "{count} needs review",
    id: "Arnvw9SDLl",
    description: "Reviewer status bar: number of loaded strings that need review",
  },
  statusPending: {
    defaultMessage: "{count} untranslated",
    id: "tVfRqmGQi5",
    description: "Reviewer status bar: number of loaded strings that are untranslated",
  },
  statusIssues: {
    defaultMessage: "{count, plural, one {# with issues} other {# with issues}}",
    id: "rEPDxzOsjX",
    description: "Reviewer status bar: number of loaded strings with open issues or failed QA",
  },
  statusBarLabel: {
    defaultMessage: "Review progress for loaded strings",
    id: "LkKS8wz4jo",
    description: "Accessible label for the Reviewer status bar",
  },
});
