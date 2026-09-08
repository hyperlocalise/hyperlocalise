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
import { isCatSegmentLocked } from "@/lib/projects/content-editor/content-editor-segment-lock-service";
import {
  analyzeCatMessageFormat,
  compareCatMessageFormats,
  type ContentEditorMessageParityIssue,
} from "@/components/content-editor/message-format/content-editor-message-format";
import {
  getNativeProjectContentEditorSegmentDetail,
  saveNativeProjectContentEditorTranslation,
} from "@/lib/projects/content-editor/native-content-editor-service";

export type McpUpdateTranslationDetail = {
  id: string;
  targetText: string;
  status: "draft" | "approved";
  updatedAt: string;
};

type McpUpdateTranslationResult =
  | {
      ok: true;
      value: McpUpdateTranslationDetail;
    }
  | {
      ok: false;
      error: "translation_not_found" | "translation_locked";
    }
  | {
      ok: false;
      error: "invalid_translation";
      issues: ContentEditorMessageParityIssue[];
    };

export async function updateMcpTranslation(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  targetLocale: string;
  targetText: string;
  approve?: boolean;
  actorUserId: string;
}): Promise<McpUpdateTranslationResult> {
  const detail = await getNativeProjectContentEditorSegmentDetail({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyId: input.translationKeyId,
    targetLocale: input.targetLocale,
  });

  if (!detail) {
    return {
      ok: false,
      error: "translation_not_found",
    };
  }

  const locked = await isCatSegmentLocked({
    organizationId: input.organizationId,
    projectId: input.projectId,
    targetLocale: input.targetLocale,
    externalStringId: input.translationKeyId,
  });

  if (locked) {
    return {
      ok: false,
      error: "translation_locked",
    };
  }

  const formatIssues = compareCatMessageFormats(
    analyzeCatMessageFormat(detail.segment.sourceText),
    analyzeCatMessageFormat(input.targetText),
  ).filter((issue) => issue.kind !== "extra-token");

  if (formatIssues.length > 0) {
    return {
      ok: false,
      error: "invalid_translation",
      issues: formatIssues,
    };
  }

  const status = input.approve ? "approved" : "draft";
  const saved = await saveNativeProjectContentEditorTranslation({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: detail.segment.sourcePath,
    translationKeyId: input.translationKeyId,
    targetLocale: input.targetLocale,
    text: input.targetText,
    approve: input.approve ?? false,
    actorUserId: input.actorUserId,
    provenance: "agent",
  });

  if (!saved) {
    return {
      ok: false,
      error: "translation_not_found",
    };
  }

  return {
    ok: true,
    value: {
      id: input.translationKeyId,
      targetText: saved.text,
      status,
      updatedAt: saved.updatedAt.toISOString(),
    },
  };
}
