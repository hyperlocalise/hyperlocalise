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
    defaultMessage: "{total} total · {reviewed} reviewed",
    id: "QCxFpsyrag",
    description: "Segment queue summary showing total and reviewed counts",
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

export const catToneMessages = defineMessages({
  sourceAi: {
    defaultMessage: "AI",
    id: "tK0t302C5U",
    description: "Badge label for an AI-generated CAT suggestion",
  },
  sourceGlossary: {
    defaultMessage: "Glossary",
    id: "V+GHSOFLEr",
    description: "Badge label for a glossary-based CAT suggestion",
  },
  sourceTm: {
    defaultMessage: "TM",
    id: "+H5q/WALpt",
    description: "Badge label for a translation memory CAT suggestion",
  },
  sourceMt: {
    defaultMessage: "MT",
    id: "expYVaTo2d",
    description: "Badge label for a machine translation CAT suggestion",
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
  saveTranslationFailed: {
    defaultMessage: "Failed to save translation.",
    id: "pMRZvoJLzS",
    description: "Fallback error when approving or saving a CAT translation fails",
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
});

export const catSuggestionsTabsMessages = defineMessages({
  suggestionsTab: {
    defaultMessage: "Suggestions {count}",
    id: "eMf+c9N3t5",
    description: "CAT suggestions drawer tab showing suggestion count",
  },
  historyTab: {
    defaultMessage: "History {count}",
    id: "C9czZHFhB5",
    description: "CAT suggestions drawer tab showing revision history count",
  },
  glossaryTab: {
    defaultMessage: "Glossary matches {count}",
    id: "fnePVmHoGg",
    description: "CAT suggestions drawer tab showing glossary match count",
  },
  basedOnSimilar: {
    defaultMessage: "Based on {count} similar translations",
    id: "5IfbvZ6RDU",
    description: "Footer note for CAT suggestions derived from translation memory matches",
  },
  historyAvailable: {
    defaultMessage: "{count} previous revisions available for this string.",
    id: "A4FjXhuep2",
    description: "CAT history tab when prior revisions exist",
  },
  noHistory: {
    defaultMessage: "No revision history yet.",
    id: "T4JM/NthUA",
    description: "CAT history tab empty state",
  },
  glossaryMatches: {
    defaultMessage: "{count} approved glossary terms match this segment.",
    id: "v4I2Z4hlz+",
    description: "CAT glossary tab when approved terms match the segment",
  },
  noGlossaryMatches: {
    defaultMessage: "No glossary matches for this segment.",
    id: "FaKEfdW84W",
    description: "CAT glossary tab empty state",
  },
  use: {
    defaultMessage: "Use",
    id: "1JXFNEtQ4J",
    description: "Button to apply a CAT suggestion to the target translation",
  },
  collapse: {
    defaultMessage: "Collapse",
    id: "eABCOj2JVn",
    description: "Button to collapse the CAT suggestions drawer",
  },
  expand: {
    defaultMessage: "Expand",
    id: "a5kZWopQ4Y",
    description: "Button to expand the CAT suggestions drawer",
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
  matchPercent: {
    defaultMessage: "{matchPercent}% match",
    id: "c8ULJQ9Qs8",
    description: "Translation memory match quality badge",
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
    defaultMessage: "Previous segment (⌘←)",
    id: "fjCr7YjlbN",
    description: "Tooltip for the previous segment navigation button",
  },
  nextSegmentTitle: {
    defaultMessage: "Next segment (⌘→)",
    id: "A4pgNxiL6F",
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
});
