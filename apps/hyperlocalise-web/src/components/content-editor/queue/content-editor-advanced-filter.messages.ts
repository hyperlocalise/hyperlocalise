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

export const contentEditorAdvancedFilterMessages = defineMessages({
  title: {
    defaultMessage: "Advanced Filter",
    id: "NPElj+0/8R",
    description: "Title of the CAT advanced filter dialog",
  },
  stringsSection: {
    defaultMessage: "Strings",
    id: "irhrhf/9/J",
    description: "Section heading for string date and label filters",
  },
  stringsAdded: {
    defaultMessage: "Strings added:",
    id: "+c45W5hmg7",
    description: "Label for the date range when source strings were added",
  },
  stringsUpdated: {
    defaultMessage: "Strings updated:",
    id: "sfaBsHFrP0",
    description: "Label for the date range when source strings were updated",
  },
  dateFrom: {
    defaultMessage: "From",
    id: "isb/K0+bJy",
    description: "Placeholder for the start date of a CAT advanced filter range",
  },
  dateTo: {
    defaultMessage: "To",
    id: "JLd0d6hF/q",
    description: "Placeholder for the end date of a CAT advanced filter range",
  },
  includeAll: {
    defaultMessage: "Labels: Include All",
    id: "rlIyD6nUs1",
    description: "Require every selected label to be present",
  },
  includeAny: {
    defaultMessage: "Labels: Include Any",
    id: "uUFqWybZEn",
    description: "Require any selected label to be present",
  },
  excludeAll: {
    defaultMessage: "Labels: Exclude All",
    id: "OHHh7wpY8I",
    description: "Exclude strings that have every selected label",
  },
  excludeAny: {
    defaultMessage: "Labels: Exclude Any",
    id: "eCkloCCnpY",
    description: "Exclude strings that have any selected label",
  },
  selectPlaceholder: {
    defaultMessage: "Select…",
    id: "wQZIWIvkiU",
    description: "Placeholder for an unset CAT advanced filter select",
  },
  selectLabels: {
    defaultMessage: "Select labels",
    id: "eoZk//4FTc",
    description: "Accessible label for the Crowdin label multi-select",
  },
  stringType: {
    defaultMessage: "String type",
    id: "pOmRJ5Mm9Y",
    description: "Label for the source string type filter",
  },
  typePlain: {
    defaultMessage: "Plain",
    id: "/O//bHFSie",
    description: "Filter option for plain source strings",
  },
  typePlural: {
    defaultMessage: "Plural",
    id: "AH67JNskUM",
    description: "Filter option for plural source strings",
  },
  typeIcu: {
    defaultMessage: "ICU",
    id: "Ls256rokr6",
    description: "Filter option for ICU source strings",
  },
  typeAsset: {
    defaultMessage: "Asset",
    id: "m2f+ZwkyAI",
    description: "Filter option for asset source strings",
  },
  translationStatus: {
    defaultMessage: "Translation status",
    id: "GjMMXsBcp5",
    description: "Label for the translation status advanced filter",
  },
  translated: {
    defaultMessage: "Translated",
    id: "C68u39Ut5W",
    description: "Filter option for translated strings",
  },
  untranslated: {
    defaultMessage: "Untranslated",
    id: "v1/c+EQLdQ",
    description: "Filter option for untranslated strings",
  },
  partiallyTranslated: {
    defaultMessage: "Partially translated",
    id: "z684Q7+r/0",
    description: "Filter option for partially translated Crowdin strings",
  },
  approvalStatus: {
    defaultMessage: "Approval status",
    id: "Mpg1bKhmu2",
    description: "Label for the approval status advanced filter",
  },
  approved: {
    defaultMessage: "Approved",
    id: "NeNEhY4v24",
    description: "Filter option for approved translations",
  },
  notApproved: {
    defaultMessage: "Not approved",
    id: "W5NQLGSL0c",
    description: "Filter option for translations that are not approved",
  },
  partiallyApproved: {
    defaultMessage: "Partially approved",
    id: "f5Adx9k+6N",
    description: "Filter option for partially approved Crowdin translations",
  },
  qaIssues: {
    defaultMessage: "QA issues",
    id: "Tr1gN4gyGr",
    description: "Label for the QA issues presence filter",
  },
  comments: {
    defaultMessage: "Comments",
    id: "FSzANJElpd",
    description: "Label for the comments presence filter",
  },
  screenshots: {
    defaultMessage: "Screenshots",
    id: "2lyiINtqCm",
    description: "Label for the screenshots presence filter",
  },
  visibility: {
    defaultMessage: "Visibility",
    id: "kWx9tZbqdb",
    description: "Label for the hidden/visible string filter",
  },
  with: {
    defaultMessage: "With",
    id: "mbKSlj62Jz",
    description: "Filter option for strings that have the selected attribute",
  },
  without: {
    defaultMessage: "Without",
    id: "ntg+tBmHjt",
    description: "Filter option for strings that lack the selected attribute",
  },
  visible: {
    defaultMessage: "Visible",
    id: "8Tkb0nDa4O",
    description: "Filter option for strings that are not hidden",
  },
  hidden: {
    defaultMessage: "Hidden",
    id: "XK3MzYiVgI",
    description: "Filter option for hidden source strings",
  },
  apply: {
    defaultMessage: "Apply",
    id: "FXyyu0UtlW",
    description: "Button that applies the CAT advanced filter",
  },
  reset: {
    defaultMessage: "Reset",
    id: "QzojW3g7Ka",
    description: "Button that clears every CAT advanced filter field",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "XWzTnPsUO3",
    description: "Button that closes the CAT advanced filter dialog without applying",
  },
  labelsCount: {
    defaultMessage: "{count, plural, one {# label} other {# labels}}",
    id: "IByZHBXjsG",
    description: "Summary of how many Crowdin labels are selected",
  },
  noLabels: {
    defaultMessage: "No labels",
    id: "AHDyYlTLB8",
    description: "Empty state when a Crowdin project has no labels to filter by",
  },
});

export const contentEditorQueueFilterQualifierMessages = defineMessages({
  tm: {
    defaultMessage: "Translation memory",
    id: "AVWmFSjbP6",
    description: "Crowdin machine-translation submenu: translation memory",
  },
  mt: {
    defaultMessage: "Machine translation",
    id: "Nu4S+TZdcN",
    description: "Crowdin machine-translation submenu: MT engine",
  },
  ai: {
    defaultMessage: "AI",
    id: "MxwNiKLkd6",
    description: "Crowdin machine-translation submenu: AI",
  },
  translationJob: {
    defaultMessage: "Translation job",
    id: "LuDLdbJ3vB",
    description: "Native machine-translation submenu: translation job provenance",
  },
  agent: {
    defaultMessage: "Agent",
    id: "xJ5xQxXWu2",
    description: "Native machine-translation submenu: agent provenance",
  },
  import: {
    defaultMessage: "Import",
    id: "x4Am9TV5tv",
    description: "Native machine-translation submenu: import provenance",
  },
  generalQuestion: {
    defaultMessage: "General question",
    id: "t3wety2JiY",
    description: "Unresolved issue submenu: general question",
  },
  translationMistake: {
    defaultMessage: "Translation mistake",
    id: "iNWvPHt1s5",
    description: "Unresolved issue submenu: translation mistake",
  },
  contextRequest: {
    defaultMessage: "Context request",
    id: "/N1uuYCyos",
    description: "Unresolved issue submenu: context request",
  },
  sourceMistake: {
    defaultMessage: "Source mistake",
    id: "IJLHOUOMZJ",
    description: "Unresolved issue submenu: source mistake",
  },
  glossaryViolation: {
    defaultMessage: "Glossary violation",
    id: "xOMOe1+cV/",
    description: "Unresolved issue submenu: glossary violation",
  },
  qaFailure: {
    defaultMessage: "QA failure",
    id: "pnAixkNSMy",
    description: "Unresolved issue submenu: QA failure",
  },
});
