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
import { getNativeProjectContentEditorSegmentDetail } from "@/lib/projects/content-editor/native-content-editor-service";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";

const issueSheetService = new IssueSheetService();

export type McpTranslationDetail = {
  id: string;
  key: string;
  sourcePath: string;
  sourceText: string;
  sourceLocale: string | null;
  targetLocale: string;
  targetText: string | null;
  status: string | null;
  context: string | null;
  maxLength: number | null;
  placeholders?: unknown[];
  icu?: unknown;
  linkedIssues: Array<{
    id: string;
    identifier: string;
  }>;
};

export async function loadMcpTranslation(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  sourceLocale: string | null;
  targetLocale: string;
}): Promise<McpTranslationDetail | null> {
  const detail = await getNativeProjectContentEditorSegmentDetail({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyId: input.translationKeyId,
    targetLocale: input.targetLocale,
  });

  if (!detail) {
    return null;
  }

  const linkedIssues = await issueSheetService.listLinkedIssueIdentifiers({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyId: detail.segment.externalStringId,
  });

  return {
    id: detail.segment.externalStringId,
    key: detail.segment.key,
    sourcePath: detail.segment.sourcePath,
    sourceText: detail.segment.sourceText,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    targetText: detail.target?.text ?? null,
    status: detail.target?.status ?? null,
    context: detail.segment.context,
    maxLength: detail.segment.maxLength ?? null,
    linkedIssues,
  };
}
