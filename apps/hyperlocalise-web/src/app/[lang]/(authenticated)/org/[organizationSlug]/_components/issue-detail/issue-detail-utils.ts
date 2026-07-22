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
import type { IntlShape } from "react-intl";

import { issueSheetSharedMessages as sharedMessages } from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-shared.messages";
import {
  issueTypeValues,
  type IssueTypeValue,
} from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-constants";

export const issueStatusValues = ["open", "in_progress", "resolved", "wont_fix"] as const;
export type IssueStatusValue = (typeof issueStatusValues)[number];

export const issuePriorityValues = ["P0", "P1", "P2"] as const;
export type IssuePriorityValue = (typeof issuePriorityValues)[number];

export const issueLinkKindValues = [
  "cat_segment",
  "native_issue",
  "provider_issue",
  "agent_run",
  "url",
  "manual",
] as const;
export type IssueLinkKindValue = (typeof issueLinkKindValues)[number];

export type IssueDetailIssue = {
  id: string;
  title: string;
  description: string;
  issueType: string;
  status: string;
  targetLocale: string | null;
  sourcePath: string | null;
  segmentId: string | null;
  translationKeyId: string | null;
  linkedCommentId: string | null;
  linkedAgentRunId: string | null;
  linkKind: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  assigneeUserId: string | null;
  reporter: string | null;
  assignee: string | null;
  key: string | null;
  sourceText: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  values: Record<string, unknown>;
};

function formatUnknownLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function issueStatusLabel(intl: IntlShape, status: string) {
  switch (status as IssueStatusValue) {
    case "open":
      return intl.formatMessage(sharedMessages.statusOpen);
    case "in_progress":
      return intl.formatMessage(sharedMessages.statusInProgress);
    case "resolved":
      return intl.formatMessage(sharedMessages.statusResolved);
    case "wont_fix":
      return intl.formatMessage(sharedMessages.statusWontFix);
    default:
      return formatUnknownLabel(status);
  }
}

export function issueTypeLabel(intl: IntlShape, value: string) {
  switch (value as IssueTypeValue) {
    case "general_question":
      return intl.formatMessage(sharedMessages.issueTypeGeneralQuestion);
    case "translation_mistake":
      return intl.formatMessage(sharedMessages.issueTypeTranslationMistake);
    case "context_request":
      return intl.formatMessage(sharedMessages.issueTypeContextRequest);
    case "source_mistake":
      return intl.formatMessage(sharedMessages.issueTypeSourceMistake);
    case "glossary_violation":
      return intl.formatMessage(sharedMessages.issueTypeGlossaryViolation);
    case "qa_failure":
      return intl.formatMessage(sharedMessages.issueTypeQaFailure);
    default:
      return formatUnknownLabel(value);
  }
}

export function issueStatusVariant(status: string) {
  if (status === "resolved") return "success" as const;
  if (status === "wont_fix") return "outline" as const;
  if (status === "in_progress") return "warning" as const;
  return "secondary" as const;
}

export function issuePriorityVariant(priority: string) {
  switch (priority as IssuePriorityValue) {
    case "P0":
      return "destructive" as const;
    case "P1":
      return "warning" as const;
    case "P2":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export function linkKindLabel(intl: IntlShape, value: string) {
  switch (value as IssueLinkKindValue) {
    case "cat_segment":
      return intl.formatMessage(sharedMessages.linkKindCatSegment);
    case "native_issue":
      return intl.formatMessage(sharedMessages.linkKindNativeIssue);
    case "provider_issue":
      return intl.formatMessage(sharedMessages.linkKindProviderIssue);
    case "agent_run":
      return intl.formatMessage(sharedMessages.linkKindAgentRun);
    case "url":
      return intl.formatMessage(sharedMessages.linkKindUrl);
    case "manual":
      return intl.formatMessage(sharedMessages.linkKindManual);
    default:
      return formatUnknownLabel(value);
  }
}

export function buildIssueCatHref(
  organizationSlug: string,
  projectId: string,
  issue: Pick<IssueDetailIssue, "sourcePath" | "targetLocale" | "segmentId">,
) {
  if (!issue.sourcePath || !issue.targetLocale) {
    return null;
  }
  const params = new URLSearchParams({
    sourcePath: issue.sourcePath,
    locale: issue.targetLocale,
  });
  if (issue.segmentId) {
    params.set("segment", issue.segmentId);
  }
  return `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/files/cat?${params.toString()}`;
}

export function isHttpOrHttpsUrl(url: string) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function isExternalHttpUrl(url: string) {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const parsed = new URL(url);
    return isHttpOrHttpsUrl(url) && parsed.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function issueSheetApiPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet`;
}

export { issueTypeValues };
