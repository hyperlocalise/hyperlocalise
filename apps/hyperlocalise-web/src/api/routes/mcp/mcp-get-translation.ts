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
import {
  analyzeCatMessageFormat,
  type ContentEditorMessageTokenKind,
} from "@/components/content-editor/message-format/content-editor-message-format";
import { getNativeProjectContentEditorSegmentDetail } from "@/lib/projects/content-editor/native-content-editor-service";
import { getRepositorySourceFileMessageFormat } from "@/lib/projects/files/source-file-message-format";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";

const issueSheetService = new IssueSheetService();

export type McpTranslationPlaceholder = {
  kind: ContentEditorMessageTokenKind;
  name: string;
  literal: string;
};

export type McpTranslationIcuBlock = {
  arg: string;
  type: "plural" | "select" | "selectordinal";
  options: string[];
};

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
  placeholders: McpTranslationPlaceholder[];
  icu: McpTranslationIcuBlock[];
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

  const [linkedIssues, messageFormat] = await Promise.all([
    issueSheetService.listLinkedIssueIdentifiers({
      organizationId: input.organizationId,
      projectId: input.projectId,
      translationKeyId: detail.segment.externalStringId,
      targetLocale: input.targetLocale,
    }),
    getRepositorySourceFileMessageFormat({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: detail.segment.sourcePath,
    }),
  ]);
  const analysis = analyzeCatMessageFormat(detail.segment.sourceText, { messageFormat });

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
    placeholders: analysis.placeholders.map((token) => ({
      kind: token.kind,
      name: token.name,
      literal: token.literal,
    })),
    icu: analysis.icuBlocks.map((block) => ({
      arg: block.arg,
      type: block.type,
      options: block.options,
    })),
    linkedIssues,
  };
}
