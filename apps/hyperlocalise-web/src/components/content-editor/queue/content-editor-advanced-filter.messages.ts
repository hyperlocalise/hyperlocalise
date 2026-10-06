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
    id: "catAdvFilterTitle",
    description: "Title of the CAT advanced filter dialog",
  },
  stringsSection: {
    defaultMessage: "Strings",
    id: "catAdvFilterStrings",
    description: "Section heading for string date and label filters",
  },
  stringsAdded: {
    defaultMessage: "Strings added:",
    id: "catAdvFilterAdded",
    description: "Label for the date range when source strings were added",
  },
  stringsUpdated: {
    defaultMessage: "Strings updated:",
    id: "catAdvFilterUpdated",
    description: "Label for the date range when source strings were updated",
  },
  dateFrom: {
    defaultMessage: "From",
    id: "catAdvFilterFrom",
    description: "Placeholder for the start date of a CAT advanced filter range",
  },
  dateTo: {
    defaultMessage: "To",
    id: "catAdvFilterTo",
    description: "Placeholder for the end date of a CAT advanced filter range",
  },
  includeAll: {
    defaultMessage: "Labels: Include All",
    id: "catAdvFilterIncludeAll",
    description: "Require every selected label to be present",
  },
  includeAny: {
    defaultMessage: "Labels: Include Any",
    id: "catAdvFilterIncludeAny",
    description: "Require any selected label to be present",
  },
  excludeAll: {
    defaultMessage: "Labels: Exclude All",
    id: "catAdvFilterExcludeAll",
    description: "Exclude strings that have every selected label",
  },
  excludeAny: {
    defaultMessage: "Labels: Exclude Any",
    id: "catAdvFilterExcludeAny",
    description: "Exclude strings that have any selected label",
  },
  selectPlaceholder: {
    defaultMessage: "Select…",
    id: "catAdvFilterSelect",
    description: "Placeholder for an unset CAT advanced filter select",
  },
  selectLabels: {
    defaultMessage: "Select labels",
    id: "catAdvFilterSelectLabels",
    description: "Accessible label for the Crowdin label multi-select",
  },
  stringType: {
    defaultMessage: "String type",
    id: "catAdvFilterStringType",
    description: "Label for the source string type filter",
  },
  typePlain: {
    defaultMessage: "Plain",
    id: "catAdvFilterTypePlain",
    description: "Filter option for plain source strings",
  },
  typePlural: {
    defaultMessage: "Plural",
    id: "catAdvFilterTypePlural",
    description: "Filter option for plural source strings",
  },
  typeIcu: {
    defaultMessage: "ICU",
    id: "catAdvFilterTypeIcu",
    description: "Filter option for ICU source strings",
  },
  typeAsset: {
    defaultMessage: "Asset",
    id: "catAdvFilterTypeAsset",
    description: "Filter option for asset source strings",
  },
  translationStatus: {
    defaultMessage: "Translation status",
    id: "catAdvFilterTranslationStatus",
    description: "Label for the translation status advanced filter",
  },
  translated: {
    defaultMessage: "Translated",
    id: "catAdvFilterTranslated",
    description: "Filter option for translated strings",
  },
  untranslated: {
    defaultMessage: "Untranslated",
    id: "catAdvFilterUntranslated",
    description: "Filter option for untranslated strings",
  },
  partiallyTranslated: {
    defaultMessage: "Partially translated",
    id: "catAdvFilterPartiallyTranslated",
    description: "Filter option for partially translated Crowdin strings",
  },
  approvalStatus: {
    defaultMessage: "Approval status",
    id: "catAdvFilterApprovalStatus",
    description: "Label for the approval status advanced filter",
  },
  approved: {
    defaultMessage: "Approved",
    id: "catAdvFilterApproved",
    description: "Filter option for approved translations",
  },
  notApproved: {
    defaultMessage: "Not approved",
    id: "catAdvFilterNotApproved",
    description: "Filter option for translations that are not approved",
  },
  partiallyApproved: {
    defaultMessage: "Partially approved",
    id: "catAdvFilterPartiallyApproved",
    description: "Filter option for partially approved Crowdin translations",
  },
  qaIssues: {
    defaultMessage: "QA issues",
    id: "catAdvFilterQaIssues",
    description: "Label for the QA issues presence filter",
  },
  comments: {
    defaultMessage: "Comments",
    id: "catAdvFilterComments",
    description: "Label for the comments presence filter",
  },
  screenshots: {
    defaultMessage: "Screenshots",
    id: "catAdvFilterScreenshots",
    description: "Label for the screenshots presence filter",
  },
  visibility: {
    defaultMessage: "Visibility",
    id: "catAdvFilterVisibility",
    description: "Label for the hidden/visible string filter",
  },
  with: {
    defaultMessage: "With",
    id: "catAdvFilterWith",
    description: "Filter option for strings that have the selected attribute",
  },
  without: {
    defaultMessage: "Without",
    id: "catAdvFilterWithout",
    description: "Filter option for strings that lack the selected attribute",
  },
  visible: {
    defaultMessage: "Visible",
    id: "catAdvFilterVisible",
    description: "Filter option for strings that are not hidden",
  },
  hidden: {
    defaultMessage: "Hidden",
    id: "catAdvFilterHidden",
    description: "Filter option for hidden source strings",
  },
  apply: {
    defaultMessage: "Apply",
    id: "catAdvFilterApply",
    description: "Button that applies the CAT advanced filter",
  },
  reset: {
    defaultMessage: "Reset",
    id: "catAdvFilterReset",
    description: "Button that clears every CAT advanced filter field",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "catAdvFilterCancel",
    description: "Button that closes the CAT advanced filter dialog without applying",
  },
  labelsCount: {
    defaultMessage: "{count, plural, one {# label} other {# labels}}",
    id: "catAdvFilterLabelsCount",
    description: "Summary of how many Crowdin labels are selected",
  },
  noLabels: {
    defaultMessage: "No labels",
    id: "catAdvFilterNoLabels",
    description: "Empty state when a Crowdin project has no labels to filter by",
  },
});

export const contentEditorQueueFilterQualifierMessages = defineMessages({
  tm: {
    defaultMessage: "Translation memory",
    id: "catQualTm",
    description: "Crowdin machine-translation submenu: translation memory",
  },
  mt: {
    defaultMessage: "Machine translation",
    id: "catQualMt",
    description: "Crowdin machine-translation submenu: MT engine",
  },
  ai: {
    defaultMessage: "AI",
    id: "catQualAi",
    description: "Crowdin machine-translation submenu: AI",
  },
  translationJob: {
    defaultMessage: "Translation job",
    id: "catQualTranslationJob",
    description: "Native machine-translation submenu: translation job provenance",
  },
  agent: {
    defaultMessage: "Agent",
    id: "catQualAgent",
    description: "Native machine-translation submenu: agent provenance",
  },
  import: {
    defaultMessage: "Import",
    id: "catQualImport",
    description: "Native machine-translation submenu: import provenance",
  },
  generalQuestion: {
    defaultMessage: "General question",
    id: "catQualGeneralQuestion",
    description: "Unresolved issue submenu: general question",
  },
  translationMistake: {
    defaultMessage: "Translation mistake",
    id: "catQualTranslationMistake",
    description: "Unresolved issue submenu: translation mistake",
  },
  contextRequest: {
    defaultMessage: "Context request",
    id: "catQualContextRequest",
    description: "Unresolved issue submenu: context request",
  },
  sourceMistake: {
    defaultMessage: "Source mistake",
    id: "catQualSourceMistake",
    description: "Unresolved issue submenu: source mistake",
  },
  glossaryViolation: {
    defaultMessage: "Glossary violation",
    id: "catQualGlossaryViolation",
    description: "Unresolved issue submenu: glossary violation",
  },
  qaFailure: {
    defaultMessage: "QA failure",
    id: "catQualQaFailure",
    description: "Unresolved issue submenu: QA failure",
  },
});
