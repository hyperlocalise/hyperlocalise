"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const jobAgentRunDiffReviewSectionMessages = defineMessages({
  changedFields: {
    defaultMessage: "Changed: {fields}",
    id: "XFpqPsul6Y",
    description: "Badge listing which fields changed on an agent proposal",
  },
  source: {
    defaultMessage: "Source",
    id: "aJdVRuXscF",
    description: "Column heading for proposal source text",
  },
  currentProviderTarget: {
    defaultMessage: "Current provider target",
    id: "uT9Dk2E9I0",
    description: "Column heading for the current TMS target text",
  },
  agentProposal: {
    defaultMessage: "Agent proposal",
    id: "IJ657tMK8/",
    description: "Column heading for the agent-proposed target text",
  },
  emptyValue: {
    defaultMessage: "—",
    id: "T7ugA9R5a+",
    description: "Placeholder when current provider target text is empty",
  },
  accept: {
    defaultMessage: "Accept",
    id: "s1gl7VHrHd",
    description: "Button to accept a single agent proposal",
  },
  reject: {
    defaultMessage: "Reject",
    id: "WpH+qSKfNZ",
    description: "Button to reject a single agent proposal",
  },
  noAgentRunSelected: {
    defaultMessage: "No agent run selected",
    id: "qXmUZikt+0",
    description: "Error when saving proposal review without a selected agent run",
  },
  failedToUpdateProposalReview: {
    defaultMessage: "Failed to update proposal review",
    id: "Ba3w87XTBS",
    description: "Toast and error fallback when saving proposal review fails",
  },
  proposalReviewSaved: {
    defaultMessage: "Proposal review saved",
    id: "Ilx4ITrXQ9",
    description: "Success toast after saving proposal review decisions",
  },
  agentProposalReviewHeading: {
    defaultMessage: "Agent Proposal Review",
    id: "zElCbJDM+q",
    description: "Section heading for reviewing agent translation proposals",
  },
  pendingCount: {
    defaultMessage: "Pending: {count}",
    id: "4km4YTRiRQ",
    description: "Summary badge for pending proposal count",
  },
  acceptedCount: {
    defaultMessage: "Accepted: {count}",
    id: "oKxh7KhAfT",
    description: "Summary badge for accepted proposal count",
  },
  rejectedCount: {
    defaultMessage: "Rejected: {count}",
    id: "zUNfzXrjpU",
    description: "Summary badge for rejected proposal count",
  },
  sectionDescription: {
    defaultMessage:
      "Inspect agent-proposed translations before pushing approved changes back to the provider.",
    id: "O2AgYH2fic",
    description: "Description under the agent proposal review heading",
  },
  selectAgentRunPlaceholder: {
    defaultMessage: "Select agent run",
    id: "q8jItOdlQf",
    description: "Placeholder for choosing which agent run to review",
  },
  agentRunOption: {
    defaultMessage: "{kind} · {createdAt}",
    id: "9hjv9tIUfP",
    description: "Select option label for a reviewable agent run",
  },
  searchPlaceholder: {
    defaultMessage: "Search key, locale, or text",
    id: "N5PxPZjCVW",
    description: "Placeholder for the proposal search field",
  },
  localePlaceholder: {
    defaultMessage: "Locale",
    id: "aB+i4xfdMu",
    description: "Placeholder for the proposal locale filter",
  },
  allLocales: {
    defaultMessage: "All locales",
    id: "kw52i77eD3",
    description: "Option to show proposals for all locales",
  },
  reviewStatePlaceholder: {
    defaultMessage: "Review state",
    id: "8v+mC3u50P",
    description: "Placeholder for the proposal review-state filter",
  },
  allStates: {
    defaultMessage: "All states",
    id: "2kOCRzFsZo",
    description: "Option to show proposals in all review states",
  },
  pending: {
    defaultMessage: "Pending",
    id: "WG+4Tv5Q93",
    description: "Filter option for pending proposals",
  },
  accepted: {
    defaultMessage: "Accepted",
    id: "xCSk4L7Wzd",
    description: "Filter option for accepted proposals",
  },
  rejected: {
    defaultMessage: "Rejected",
    id: "pYN51VY5nF",
    description: "Filter option for rejected proposals",
  },
  hasWarnings: {
    defaultMessage: "Has warnings",
    id: "E/rfTTHsFg",
    description: "Filter option for proposals that have warnings",
  },
  warningTypePlaceholder: {
    defaultMessage: "Warning type",
    id: "SCoaZFO7Pm",
    description: "Placeholder for the proposal warning-type filter",
  },
  allWarnings: {
    defaultMessage: "All warnings",
    id: "YIQiU/g1Q3",
    description: "Option to show proposals with any warning type",
  },
  warningGlossary: {
    defaultMessage: "Glossary",
    id: "4FaC9AQx5L",
    description: "Filter option for glossary warnings",
  },
  warningPlaceholder: {
    defaultMessage: "Placeholder",
    id: "QgcgQchgyn",
    description: "Filter option for placeholder warnings",
  },
  warningFormat: {
    defaultMessage: "Format",
    id: "A7gp0wsRN6",
    description: "Filter option for format warnings",
  },
  warningConfidence: {
    defaultMessage: "Confidence",
    id: "lByT1GLTpB",
    description: "Filter option for confidence warnings",
  },
  acceptAllPending: {
    defaultMessage: "Accept all pending",
    id: "zvokgWLGk/",
    description: "Bulk action to accept all pending proposals",
  },
  rejectAllPending: {
    defaultMessage: "Reject all pending",
    id: "73LPD0D66t",
    description: "Bulk action to reject all pending proposals",
  },
  acceptSelected: {
    defaultMessage: "Accept selected",
    id: "58A3bF+CPb",
    description: "Bulk action to accept selected proposals",
  },
  rejectSelected: {
    defaultMessage: "Reject selected",
    id: "4WxpcyFNqc",
    description: "Bulk action to reject selected proposals",
  },
  selectPage: {
    defaultMessage: "Select page",
    id: "HHzUD/7JQL",
    description: "Checkbox label to select all proposals on the current page",
  },
  showingFiltered: {
    defaultMessage: "Showing {pageCount} of {filteredCount} filtered · {totalCount} total",
    id: "yfeT8igA35",
    description: "Pagination summary for filtered agent proposals",
  },
  noProposalsMatchFilters: {
    defaultMessage: "No proposals match the current filters.",
    id: "8+q5tY0yg1",
    description: "Empty state when proposal filters hide all items",
  },
  previous: {
    defaultMessage: "Previous",
    id: "hxojPYuxF0",
    description: "Button to go to the previous proposals page",
  },
  pageOf: {
    defaultMessage: "Page {currentPage} of {totalPages}",
    id: "UoWZO/Gkq4",
    description: "Current page indicator for proposal pagination",
  },
  next: {
    defaultMessage: "Next",
    id: "WDaXRRP8RP",
    description: "Button to go to the next proposals page",
  },
});
