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

export const projectFileCatWorkspaceMessages = defineMessages({
  validationUnavailableLabel: {
    defaultMessage: "Validation unavailable",
    id: "Rp1ZcGydYx",
    description: "CAT format check label when segment validation service is unavailable",
  },
  cannotWriteTranslations: {
    defaultMessage: "Your role cannot write translations back.",
    id: "qGSAjtA2ao",
    description: "Error when the user tries to save or approve without write permission",
  },
  failedToApproveImage: {
    defaultMessage: "Failed to approve image",
    id: "nqfqbc0zeN",
    description: "Fallback error when approving an image translation fails",
  },
  cannotPostComments: {
    defaultMessage: "Your role cannot post comments to the provider.",
    id: "xsnuwmUnCV",
    description: "Error when the user tries to post a comment without write permission",
  },
  cannotResolveIssues: {
    defaultMessage: "Your role cannot resolve issues in the provider.",
    id: "FN9IFyAQ4Q",
    description: "Error when the user tries to resolve an issue without write permission",
  },
  segmentNotFound: {
    defaultMessage: "Segment not found.",
    id: "5wR0b8PqT0",
    description: "Error when adding a missing segment to the issue sheet",
  },
  contextNeededIssueTitle: {
    defaultMessage: "Context needed: {key}",
    id: "FVAIUC0HI7",
    description: "Issue sheet title when requesting context for a CAT segment key",
  },
  openInCatLinkLabel: {
    defaultMessage: "Open in CAT",
    id: "pof2HIGAaZ",
    description: "Link label on an issue sheet row pointing back to the CAT editor",
  },
  failedToAddToIssueSheet: {
    defaultMessage: "Failed to add to Issue Sheet",
    id: "iwQ9dbHG3A",
    description: "Fallback error when creating an issue sheet row from CAT fails",
  },
  addedToIssueSheet: {
    defaultMessage: "Added to Issue Sheet",
    id: "AF35eujXwK",
    description: "Toast confirmation after adding a CAT segment to the issue sheet",
  },
  viewIssueSheetRow: {
    defaultMessage: "View row",
    id: "zf/XYl5KpE",
    description: "Toast action to open the issue sheet row that was just created",
  },
  failedToLookUpContext: {
    defaultMessage: "Failed to look up repository context",
    id: "8gI8dqfg1a",
    description: "Fallback error when repository string context lookup fails",
  },
  failedToSearchConcordance: {
    defaultMessage: "Failed to search glossary and TM",
    id: "0T9ea5Y0Fl",
    description: "Fallback error when glossary and translation memory search fails",
  },
  failedToLoadVisualContext: {
    defaultMessage: "Failed to load in-context preview",
    id: "6oNxokQZCy",
    description: "Fallback error when in-context visual preview fails to load",
  },
  failedToGenerateRecommendation: {
    defaultMessage: "Failed to generate AI recommendation",
    id: "I3W7KYKnta",
    description: "Fallback error when AI translation recommendation generation fails",
  },
  noTargetLocales: {
    defaultMessage: "No target locales are available for this file.",
    id: "W5v3/4xBNa",
    description: "Empty state when a project file has no target locales for CAT",
  },
  failedToLoadWorkspace: {
    defaultMessage: "Failed to load CAT workspace.",
    id: "Il904Owiy9",
    description: "Fallback error when the CAT workspace query fails without an Error instance",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "3w6PJBQOmr",
    description: "Label above the target locale selector in the project file CAT workspace",
  },
  selectLocalePlaceholder: {
    defaultMessage: "Select locale",
    id: "zz/Y8OSRLj",
    description: "Placeholder for the target locale select in the project file CAT workspace",
  },
  localeCodeInParens: {
    defaultMessage: "({locale})",
    id: "d32z52fN10",
    description: "BCP-47 locale code shown in parentheses next to a locale display name",
  },
});
