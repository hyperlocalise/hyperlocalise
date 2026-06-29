"use client";

import { defineMessages } from "react-intl";

export const catWorkspaceMessages = defineMessages({
  emptyQueue: {
    defaultMessage: "No segments in queue.",
    id: "WrdM0sMy06",
    description: "Empty state when the CAT translation queue has no segments",
  },
  reviewedProgress: {
    defaultMessage: "{progress}% reviewed",
    id: "IXl2JrsI/Q",
    description: "Compact workspace header showing review completion percentage",
  },
  reviewedSummary: {
    defaultMessage: "{reviewed} of {total}",
    id: "mBxKladfFz",
    description: "Compact workspace header showing reviewed segment count out of total",
  },
  tabEdit: {
    defaultMessage: "Edit",
    id: "HrB9mIwARt",
    description: "Compact CAT workspace tab for the translation editor",
  },
  tabQueue: {
    defaultMessage: "Queue",
    id: "jEsou0wF0/",
    description: "Compact CAT workspace tab for the segment queue",
  },
  tabAi: {
    defaultMessage: "AI",
    id: "X9FvsfXTfJ",
    description: "Compact CAT workspace tab for translation intelligence",
  },
});

export const catQueuePanelMessages = defineMessages({
  queueTitle: {
    defaultMessage: "Queue",
    id: "EUZbcVhX5v",
    description: "Heading for the CAT segment queue panel",
  },
  queueSummary: {
    defaultMessage:
      "{reviewed}/{total} reviewed · {untranslated} untranslated · {needsReview} to review · {hasIssues} with issues",
    id: "D/5RN82ldi",
    description: "File-level segment queue summary showing review progress and status breakdown",
  },
  filterQueueAria: {
    defaultMessage: "Filter queue",
    id: "qSH0vWKsTL",
    description: "Accessible label for the queue filter button",
  },
  queueActionsAria: {
    defaultMessage: "Queue actions",
    id: "fDknk0nTC0",
    description: "Accessible label for the queue overflow actions button",
  },
  searchPlaceholder: {
    defaultMessage: "Search key or text…",
    id: "8TtvvjSylP",
    description: "Placeholder for CAT queue search input",
  },
  searchAria: {
    defaultMessage: "Search segments by key or source text",
    id: "Wk16E7zAqa",
    description: "Accessible label for CAT queue search input",
  },
  emptySearchResults: {
    defaultMessage: "No segments match your search.",
    id: "ypyJIGOXrt",
    description: "Empty state when CAT queue search returns no segments",
  },
  paginationSummary: {
    defaultMessage: "{start}–{end} of {total}",
    id: "7YdMLbBTSy",
    description: "Pagination summary for CAT queue pages",
  },
  previousPage: {
    defaultMessage: "Previous",
    id: "oFQD3YDzBl",
    description: "Previous page button label in CAT queue",
  },
  nextPage: {
    defaultMessage: "Next",
    id: "U/tZOaayjq",
    description: "Next page button label in CAT queue",
  },
  unsavedChangesAria: {
    defaultMessage: "Unsaved changes",
    id: "CHs2ugz7iN",
    description: "Accessible label for queue row indicator when a segment has unsaved edits",
  },
  filterAll: {
    defaultMessage: "All strings",
    id: "V+8wDWpBnh",
    description: "CAT queue filter option showing every segment",
  },
  filterUntranslated: {
    defaultMessage: "Untranslated",
    id: "Kdyh8ZKnlc",
    description: "CAT queue filter option for segments without a target translation",
  },
  filterNeedsReview: {
    defaultMessage: "Needs review",
    id: "cMuLE7Fon0",
    description: "CAT queue filter option for translated segments awaiting review",
  },
  filterReviewed: {
    defaultMessage: "Approved",
    id: "F6X8Sh27Q0",
    description: "CAT queue filter option for approved segments",
  },
  filterHasIssues: {
    defaultMessage: "Has issues",
    id: "U+tI5HA1qo",
    description: "CAT queue filter option for segments with open issue comments",
  },
  filterSkipped: {
    defaultMessage: "Skipped",
    id: "75tLVTlfqV",
    description: "CAT queue filter option for skipped segments",
  },
  emptyFilterResults: {
    defaultMessage: "No segments match this filter.",
    id: "oY/dfpDvR7",
    description: "Empty state when CAT queue status filter returns no segments",
  },
  bulkApprove: {
    defaultMessage: "Approve selected",
    id: "sPeeyibl9Y",
    description: "Bulk action to approve all selected CAT segments",
  },
  bulkSkip: {
    defaultMessage: "Skip selected",
    id: "zCn3UqvqWI",
    description: "Bulk action to skip all selected CAT segments",
  },
  bulkSelectAll: {
    defaultMessage: "Select all visible",
    id: "1v2hbAXp/Y",
    description: "Bulk action to select every segment in the current queue view",
  },
  bulkClearSelection: {
    defaultMessage: "Clear selection",
    id: "whr/nciIbp",
    description: "Bulk action to clear the current segment selection",
  },
  bulkSelectionSummary: {
    defaultMessage: "{count} selected",
    id: "uZnk0UoDEu",
    description: "Summary of how many CAT queue segments are selected for bulk actions",
  },
  selectSegmentAria: {
    defaultMessage: "Select {key}",
    id: "Ygi+pnLdm5",
    description: "Accessible label for selecting a CAT queue segment for bulk actions",
  },
});

export const catSegmentStatusMessages = defineMessages({
  pending: {
    defaultMessage: "Untranslated",
    id: "pmgrWye2G2",
    description: "CAT segment status label for segments without a target translation",
  },
  needsReview: {
    defaultMessage: "Needs review",
    id: "18VKZNqtbO",
    description: "CAT segment status label for translated segments awaiting review",
  },
  reviewed: {
    defaultMessage: "Approved",
    id: "kGM2czQvBa",
    description: "CAT segment status label for approved segments",
  },
  skipped: {
    defaultMessage: "Skipped",
    id: "9Pt2hFyO/v",
    description: "CAT segment status label for skipped segments",
  },
  statusDotAria: {
    defaultMessage: "Status: {status}",
    id: "ecBrADENW6",
    description: "Accessible label for segment status indicator dot in the CAT queue",
  },
});

export const catGlossaryChecksMessages = defineMessages({
  complianceLabel: {
    defaultMessage: "Glossary compliance",
    id: "8BeERYABTz",
    description: "CAT format check label for glossary compliance summary",
  },
  compliancePassMessage: {
    defaultMessage: "Approved glossary terms are used correctly and forbidden terms are absent.",
    id: "irDjU9PSS4",
    description: "CAT format check message when glossary terms pass validation",
  },
  forbiddenTermLabel: {
    defaultMessage: "Forbidden glossary term",
    id: "8OHSn5eQCa",
    description: "CAT format check label when a forbidden glossary term appears in the target",
  },
  forbiddenTermMessage: {
    defaultMessage: 'Forbidden term "{term}" appears in the target translation.',
    id: "ivdHFzfBNo",
    description: "CAT format check message when a forbidden glossary term appears in the target",
  },
  missingTermLabel: {
    defaultMessage: "Glossary term mismatch",
    id: "lN7mrKGBHB",
    description: "CAT format check label when a required glossary rendering is missing",
  },
  missingTermMessage: {
    defaultMessage:
      'Source term "{sourceTerm}" should be translated as "{targetTerm}" per the glossary.',
    id: "nG1gispZFL",
    description: "CAT format check message when a required glossary rendering is missing",
  },
});

export const catFormatChecksMessages = defineMessages({
  emptyChecks: {
    defaultMessage: "No format or QA checks for this segment yet.",
    id: "UAby6HY7Nw",
    description: "Empty state when a CAT segment has no format or QA checks",
  },
  statusPass: {
    defaultMessage: "Passed",
    id: "pV6OSYt6fC",
    description: "Label for a CAT format check that passed",
  },
  statusWarn: {
    defaultMessage: "Check",
    id: "92YYrAXEnO",
    description: "Label for a CAT format check that needs attention",
  },
  statusFail: {
    defaultMessage: "Issue",
    id: "deD7TAf/DJ",
    description: "Label for a CAT format check that failed",
  },
});

export const catWorkspaceContainerMessages = defineMessages({
  saveFailedLabel: {
    defaultMessage: "Save failed",
    id: "JikjOnc0U+",
    description: "CAT format check label when saving a translation fails",
  },
  concordanceSearchLabel: {
    defaultMessage: "Concordance search",
    id: "7lj/bHhabs",
    description: "CAT format check label when glossary and TM lookup fails",
  },
  concordanceSearchFailed: {
    defaultMessage: "Failed to search glossary and TM.",
    id: "gEzAovu3oc",
    description: "Fallback error when glossary and translation memory lookup fails",
  },
  aiRecommendationLabel: {
    defaultMessage: "AI recommendation",
    id: "itUSZfLzOK",
    description: "CAT format check label when AI translation recommendation fails",
  },
  aiRecommendationFailed: {
    defaultMessage: "Failed to generate AI translation recommendation.",
    id: "QUgt69cPVZ",
    description: "Fallback error when AI translation recommendation generation fails",
  },
  contextLookupLabel: {
    defaultMessage: "Context lookup",
    id: "baKeJi7lvv",
    description: "CAT format check label when repository context lookup fails",
  },
  contextLookupFailed: {
    defaultMessage: "Failed to look up repository context.",
    id: "BGfQ06k8Pb",
    description: "Fallback error when repository context lookup fails",
  },
  visualContextLoadFailed: {
    defaultMessage: "Failed to load in-context preview from the provider.",
    id: "qd8sDGeNiM",
    description: "Fallback error when TMS visual context preview fails to load",
  },
  saveTranslationFailed: {
    defaultMessage: "Failed to save translation.",
    id: "pMRZvoJLzS",
    description: "Fallback error when approving or saving a CAT translation fails",
  },
  unsavedSegmentNavigationTitle: {
    defaultMessage: "Leave segment with unsaved changes?",
    id: "2O/RojUz55",
    description: "Title when navigating away from a segment with unsaved target text",
  },
  unsavedSegmentNavigationDescription: {
    defaultMessage: "Your edits to this segment have not been saved. Leave without saving?",
    id: "37yFkjafwR",
    description: "Body when navigating away from a segment with unsaved target text",
  },
  unsavedPageNavigationTitle: {
    defaultMessage: "Leave page with unsaved changes?",
    id: "oeD72ehQB/",
    description: "Title when changing CAT queue page with unsaved target text",
  },
  unsavedPageNavigationDescription: {
    defaultMessage: "Some segments on this page have unsaved edits. Change page without saving?",
    id: "+pyXMBZm58",
    description: "Body when changing CAT queue page with unsaved target text",
  },
  unsavedNavigationStay: {
    defaultMessage: "Stay",
    id: "+EhuajKQYW",
    description: "Cancel button for unsaved changes navigation guard",
  },
  unsavedNavigationDiscard: {
    defaultMessage: "Leave without saving",
    id: "VR+xvnXyUj",
    description: "Confirm button to navigate away without saving target edits",
  },
});

export const catTargetEditorMessages = defineMessages({
  icuStructure: {
    defaultMessage: "ICU structure",
    id: "J6dfku2qcD",
    description: "Heading for ICU plural/select structure summary below the CAT target editor",
  },
  targetTranslationAria: {
    defaultMessage: "Target translation",
    id: "7qpCwZIaq2",
    description: "Accessible label for the CAT target translation editor",
  },
  targetPlaceholder: {
    defaultMessage: "Enter translation...",
    id: "3vrwpYmV2v",
    description: "Placeholder for the CAT target translation editor",
  },
  requiredTokens: {
    defaultMessage: "Required tokens",
    id: "zVk2EFJa3O",
    description: "Label for required ICU and placeholder tokens below the CAT target editor",
  },
  characterCount: {
    defaultMessage: "{count}/{maxLength} characters",
    id: "MB3Jte6am8",
    description: "Live character count for the CAT target translation against a max length limit",
  },
  characterCountAria: {
    defaultMessage: "{count} of {maxLength} characters used",
    id: "+jUwPCSypy",
    description: "Accessible label for the CAT target translation character counter",
  },
});

export const catIntelligencePanelMessages = defineMessages({
  panelTitle: {
    defaultMessage: "Translation Intelligence",
    id: "uR9VI1Hsnk",
    description: "Heading for the CAT translation intelligence side panel",
  },
  panelDescription: {
    defaultMessage: "Context and terminology for this string.",
    id: "bzdmXkD3a+",
    description: "Supporting copy below the CAT translation intelligence panel heading",
  },
  fileContextTitle: {
    defaultMessage: "Context attached in the file",
    id: "HZtAltEBuQ",
    description: "Section heading for developer context attached in the source file",
  },
  fileContextAria: {
    defaultMessage: "File context",
    id: "9RkSMcYnN2",
    description: "Accessible label for file-attached context markdown content",
  },
  noFileContext: {
    defaultMessage: "No context is attached to this string in the source file.",
    id: "H3PhSgBYwu",
    description: "Empty state when no developer context is attached in the source file",
  },
  agentContextTitle: {
    defaultMessage: "Context found by agent",
    id: "obaPDIKyjU",
    description: "Section heading for repository context discovered by an agent",
  },
  meaningInProduct: {
    defaultMessage: "Meaning in product",
    id: "99wOujGZDN",
    description: "Insight card label for agent-discovered product meaning",
  },
  agentContextAria: {
    defaultMessage: "Agent context",
    id: "4lhHg5n2pX",
    description: "Accessible label for agent-discovered context markdown content",
  },
  translationIntentAria: {
    defaultMessage: "Translation intent",
    id: "cQwXYuUd6c",
    description: "Accessible label for translation intent markdown content",
  },
  noRepositoryContext: {
    defaultMessage: "No repository context was found for this string.",
    id: "30EiG+BWcI",
    description: "Empty state when agent repository context lookup returns nothing",
  },
  glossaryGuidance: {
    defaultMessage: "Glossary guidance",
    id: "ee60kiAN7Z",
    description: "Section heading for glossary term guidance in the intelligence panel",
  },
  translationMemory: {
    defaultMessage: "Translation memory",
    id: "okYWXGLSBl",
    description: "Section heading for translation memory matches in the intelligence panel",
  },
  approvedAria: {
    defaultMessage: "Approved",
    id: "jGuaDovXli",
    description: "Accessible label for an approved glossary term",
  },
  forbiddenInTargetAria: {
    defaultMessage: "Forbidden term used in translation",
    id: "gEtNXv9OoK",
    description: "Accessible label when a forbidden glossary term appears in the target text",
  },
  matchPercent: {
    defaultMessage: "{matchPercent}% match",
    id: "c8ULJQ9Qs8",
    description: "Translation memory match quality badge",
  },
  matchKindExact: {
    defaultMessage: "100% match",
    id: "hhrYYWvHkj",
    description: "Badge label for an exact translation memory match",
  },
  matchKindContext: {
    defaultMessage: "Context match",
    id: "5H+UdOBSV9",
    description: "Badge label for a context translation memory match",
  },
  matchKindFuzzy: {
    defaultMessage: "Fuzzy match",
    id: "ReZgZHvqUS",
    description: "Badge label for a fuzzy translation memory match",
  },
  useTmMatch: {
    defaultMessage: "Use",
    id: "rHDcSl4Kt4",
    description: "Button to apply a translation memory match to the target field",
  },
  useGlossaryTerm: {
    defaultMessage: "Use",
    id: "/qvZ8TPpqw",
    description: "Button to apply an approved glossary term to the target field",
  },
  lowMatchConfirmTitle: {
    defaultMessage: "Apply low-quality TM match?",
    id: "nojhrDNSfO",
    description: "Title for confirmation dialog when applying a TM match below 70%",
  },
  lowMatchConfirmDescription: {
    defaultMessage:
      "This match is only {matchPercent}% similar. Applying it may introduce errors. Continue?",
    id: "R+eufhiwar",
    description: "Body for confirmation dialog when applying a low-quality TM match",
  },
  lowMatchConfirmAction: {
    defaultMessage: "Apply anyway",
    id: "y/0rjxqRwk",
    description: "Confirm button for applying a low-quality TM match",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "Eecec2KI1k",
    description: "Cancel button for low-quality TM match confirmation",
  },
});

export const catEditorPanelMessages = defineMessages({
  previousSegmentAria: {
    defaultMessage: "Previous segment",
    id: "fXIJvHCrL6",
    description: "Accessible label for the previous segment navigation button",
  },
  nextSegmentAria: {
    defaultMessage: "Next segment",
    id: "7+I/+6Aeqq",
    description: "Accessible label for the next segment navigation button",
  },
  previousSegmentTitle: {
    defaultMessage: "Previous segment ({shortcut})",
    id: "VGayu+ZFkL",
    description: "Tooltip for the previous segment navigation button",
  },
  nextSegmentTitle: {
    defaultMessage: "Next segment ({shortcut})",
    id: "kHLqanH9yi",
    description: "Tooltip for the next segment navigation button",
  },
  sourceHeading: {
    defaultMessage: "Source ({locale})",
    id: "wnYoaQhT6i",
    description: "Section heading for the source string with locale code",
  },
  targetHeading: {
    defaultMessage: "Target ({locale})",
    id: "1PcszZ/Z93",
    description: "Section heading for the target translation with locale code",
  },
  approve: {
    defaultMessage: "Approve",
    id: "0+GXVlndL6",
    description: "Primary action to approve the current CAT translation",
  },
  saveAsDraft: {
    defaultMessage: "Save as draft",
    id: "YdeVnuUNms",
    description: "Secondary action to save the current translation without approving it",
  },
  findContextTitle: {
    defaultMessage: "Look up where this string appears in the connected repository",
    id: "BnZ3uPwDP7",
    description: "Tooltip for the find repository context button when available",
  },
  findContextUnavailableTitle: {
    defaultMessage: "Repository context lookup is not available",
    id: "jSRe68HWab",
    description: "Tooltip for the find repository context button when unavailable",
  },
  findingContext: {
    defaultMessage: "Finding context…",
    id: "rjJJmHDMJh",
    description: "Loading label while repository context is being looked up",
  },
  findContext: {
    defaultMessage: "Find context",
    id: "/MBsvL6JVH",
    description: "Button to look up repository context for the current string",
  },
  previous: {
    defaultMessage: "Previous",
    id: "tTTsndxkMz",
    description: "Desktop navigation button to the previous segment",
  },
  next: {
    defaultMessage: "Next",
    id: "4R0gB8zCuT",
    description: "Desktop navigation button to the next segment",
  },
  aiRecommendation: {
    defaultMessage: "AI recommendation",
    id: "nkxYJYYDTw",
    description: "Heading for the AI translation recommendation panel",
  },
  use: {
    defaultMessage: "Use",
    id: "fp+BAxQben",
    description: "Button to apply the AI recommendation to the target translation",
  },
  regenerate: {
    defaultMessage: "Regenerate",
    id: "oghE756t99",
    description: "Button to regenerate an existing AI translation recommendation",
  },
  getRecommendation: {
    defaultMessage: "Get recommendation",
    id: "MN2GW5Szxo",
    description: "Button to request an AI translation recommendation",
  },
  reasoningPrefix: {
    defaultMessage: "Reasoning:",
    id: "0zYUPddzdy",
    description: "Label prefix before AI recommendation reasoning text",
  },
  aiSuggestionEmpty: {
    defaultMessage: "Generate a translation suggestion for this string.",
    id: "8yJ9TkhoZy",
    description: "Empty state when no AI recommendation has been generated yet",
  },
  formatQaChecks: {
    defaultMessage: "Format & QA checks",
    id: "ubk8Jr6n+B",
    description: "Section heading for format and quality assurance checks",
  },
  comments: {
    defaultMessage: "Comments",
    id: "3bgw2z94hj",
    description: "Section heading for reviewer comments on the current segment",
  },
  noComments: {
    defaultMessage: "No comments yet. Add a note for reviewers or translators.",
    id: "EQ94/v/KcI",
    description: "Empty state for the segment comments section",
  },
  commentPlaceholder: {
    defaultMessage: "Add a comment...",
    id: "9bSARO1BLR",
    description: "Placeholder for the segment comment input",
  },
  addComment: {
    defaultMessage: "Add comment",
    id: "Iv9Zw2Kz/I",
    description: "Button to submit a new segment comment",
  },
  commentAuthorReviewer: {
    defaultMessage: "Reviewer",
    id: "dLflEs1D1h",
    description: "Default author name for locally added segment comments",
  },
  commentCreatedJustNow: {
    defaultMessage: "Just now",
    id: "LOKE6DdX5z",
    description: "Timestamp label for a comment added moments ago",
  },
  commentIssueLabel: {
    defaultMessage: "Issue",
    id: "rfurrkqR11",
    description: "Badge label for an unresolved TMS issue on a segment",
  },
  commentPostFailed: {
    defaultMessage: "Failed to post comment. Try again.",
    id: "wAW00AgfLK",
    description: "Error message when posting a segment comment to the TMS fails",
  },
  postingComment: {
    defaultMessage: "Posting…",
    id: "j+ggKPYEzH",
    description: "Button label while a segment comment is being posted to the TMS",
  },
  unsavedChanges: {
    defaultMessage: "Unsaved",
    id: "RSN+J7hbqE",
    description: "Badge shown when the current segment has unsaved target edits",
  },
  copySource: {
    defaultMessage: "Copy source",
    id: "JERGbk68rN",
    description: "Button to copy the source string into the target translation field",
  },
  clearTarget: {
    defaultMessage: "Clear target",
    id: "5/hlw6iDag",
    description: "Button to clear the target translation field",
  },
  shareSegment: {
    defaultMessage: "Copy link",
    id: "H7+t0VoSpu",
    description: "Button to copy a shareable link to the current CAT segment",
  },
  shareSegmentCopied: {
    defaultMessage: "Link copied",
    id: "0YoaNbe8v4",
    description: "Tooltip after a CAT segment share link is copied to the clipboard",
  },
  shareSegmentFailed: {
    defaultMessage: "Could not copy link",
    id: "HLG4pq/SOg",
    description: "Tooltip when copying a CAT segment share link fails",
  },
  shareSegmentAria: {
    defaultMessage: "Copy link to this segment",
    id: "CqDUHu+YvU",
    description: "Accessible label for the CAT segment share link button",
  },
});

export const catVisualContextPanelMessages = defineMessages({
  title: {
    defaultMessage: "In-context preview",
    id: "2W3toA+qRz",
    description: "Section heading for TMS screenshot context in the CAT intelligence panel",
  },
  description: {
    defaultMessage: "Screenshots attached in your TMS for this string.",
    id: "3Td/QL9gLC",
    description: "Supporting copy for TMS screenshot context in the CAT intelligence panel",
  },
  empty: {
    defaultMessage: "No screenshots are attached to this string in the provider.",
    id: "ISCo8PAGGI",
    description: "Empty state when a TMS string has no screenshot context",
  },
  screenshotAltFallback: {
    defaultMessage: "Screenshot context for this string",
    id: "jORzWMtK+S",
    description: "Accessible fallback label for a TMS screenshot preview image",
  },
});

export const catPanelErrorBoundaryMessages = defineMessages({
  queuePanelTitle: {
    defaultMessage: "Queue panel failed to load",
    id: "ppXDMSLgyj",
    description: "Error boundary title when the CAT queue panel crashes",
  },
  editorPanelTitle: {
    defaultMessage: "Editor panel failed to load",
    id: "6PFnjoc6zP",
    description: "Error boundary title when the CAT editor panel crashes",
  },
  intelligencePanelTitle: {
    defaultMessage: "Intelligence panel failed to load",
    id: "W5kKZQXtt1",
    description: "Error boundary title when the CAT intelligence panel crashes",
  },
  workspaceTitle: {
    defaultMessage: "CAT workspace failed to load",
    id: "Kdwno+5sGa",
    description: "Error boundary title when the full CAT workspace crashes",
  },
  description: {
    defaultMessage:
      "Something went wrong in this part of the tool. You can retry or keep working in the other panels.",
    id: "e7p8bFrcw5",
    description: "Error boundary description shown when a CAT panel crashes",
  },
  retry: {
    defaultMessage: "Try again",
    id: "27qrEmB3yO",
    description: "Button label to retry rendering a crashed CAT panel",
  },
});
