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

export const issueSheetSharedMessages = defineMessages({
  issueTypeGeneralQuestion: {
    defaultMessage: "General question",
    id: "4iAGuhOoL/",
    description: "Issue Sheet issue type option for a general question",
  },
  issueTypeTranslationMistake: {
    defaultMessage: "Translation mistake",
    id: "G6UECKdIQ0",
    description: "Issue Sheet issue type option for a translation mistake",
  },
  issueTypeContextRequest: {
    defaultMessage: "Context request",
    id: "clCA8uRLFv",
    description: "Issue Sheet issue type option for a context request",
  },
  issueTypeSourceMistake: {
    defaultMessage: "Source mistake",
    id: "ez8PrKiaQJ",
    description: "Issue Sheet issue type option for a source mistake",
  },
  issueTypeGlossaryViolation: {
    defaultMessage: "Glossary violation",
    id: "hhvHbeOb/+",
    description: "Issue Sheet issue type option for a glossary violation",
  },
  issueTypeQaFailure: {
    defaultMessage: "QA failure",
    id: "IrBIXRrQQ2",
    description: "Issue Sheet issue type option for a QA failure",
  },
  columnTypeText: {
    defaultMessage: "Text",
    id: "hOzGfyBVYH",
    description: "Issue Sheet column type option for short text",
  },
  columnTypeLongText: {
    defaultMessage: "Long text",
    id: "C3zzzmQ5mX",
    description: "Issue Sheet column type option for long text",
  },
  columnTypeSelect: {
    defaultMessage: "Select",
    id: "Qn/UGdy2iq",
    description: "Issue Sheet column type option for a select list",
  },
  columnTypeUserId: {
    defaultMessage: "User ID",
    id: "UAMQfqPAzo",
    description: "Issue Sheet column type option for a user ID",
  },
  statusOpen: {
    defaultMessage: "Open",
    id: "LTjIAI6GQC",
    description: "Issue Sheet status option when an issue is open",
  },
  statusInProgress: {
    defaultMessage: "In progress",
    id: "/KZjaB2GIT",
    description: "Issue Sheet status option when an issue is in progress",
  },
  statusResolved: {
    defaultMessage: "Resolved",
    id: "ad1N8PatES",
    description: "Issue Sheet status option when an issue is resolved",
  },
  statusWontFix: {
    defaultMessage: "Won’t fix",
    id: "G0DAu7HpBC",
    description: "Issue Sheet status option when an issue will not be fixed",
  },
  linkKindCatSegment: {
    defaultMessage: "CAT segment",
    id: "v+JpRsdgw2",
    description: "Issue Sheet link kind for a CAT segment",
  },
  linkKindNativeIssue: {
    defaultMessage: "Native issue",
    id: "QVweQ7BzMt",
    description: "Issue Sheet link kind for a native issue",
  },
  linkKindProviderIssue: {
    defaultMessage: "Provider issue",
    id: "ienF5sVVz0",
    description: "Issue Sheet link kind for a provider issue",
  },
  linkKindAgentRun: {
    defaultMessage: "Agent run",
    id: "te38CqnzSy",
    description: "Issue Sheet link kind for an agent run",
  },
  linkKindUrl: {
    defaultMessage: "URL",
    id: "q4WpE1QriH",
    description: "Issue Sheet link kind for an external URL",
  },
  linkKindManual: {
    defaultMessage: "Manual",
    id: "WUFTI428rT",
    description: "Issue Sheet link kind for a manually created issue",
  },
  emptyValue: {
    defaultMessage: "—",
    id: "wy44X4k96P",
    description: "Placeholder shown when an Issue Sheet cell has no value",
  },
});
