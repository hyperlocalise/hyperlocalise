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
import { mcpActivityActor } from "@/api/routes/mcp/mcp-activity-actor";
import {
  analyzeCatMessageFormat,
  compareCatMessageFormats,
  type ContentEditorMessageParityIssue,
} from "@/components/content-editor/message-format/content-editor-message-format";
import { enqueueStringSegmentApprovedActivity } from "@/lib/activity-log/file-segment-events";
import type { MessageFormat } from "@/lib/i18n/message-format";
import { isCatSegmentLocked } from "@/lib/projects/content-editor/content-editor-segment-lock-service";
import {
  getNativeProjectContentEditorSegmentDetail,
  saveNativeProjectContentEditorTranslation,
  updateNativeProjectTranslationStatus,
} from "@/lib/projects/content-editor/native-content-editor-service";
import { getRepositorySourceFileMessageFormat } from "@/lib/projects/files/source-file-message-format";

export type McpUpdateTranslationDetail = {
  id: string;
  targetText: string;
  status: "draft" | "approved";
  updatedAt: string;
};

export type McpTranslationValidationIssue =
  | ContentEditorMessageParityIssue
  | {
      kind: "empty-target";
    };

export type McpTranslationStatus = "needs_review" | "approved" | "rejected";

type McpTranslationMutationError =
  | {
      ok: false;
      error: "translation_not_found" | "translation_locked";
    }
  | {
      ok: false;
      error: "invalid_translation";
      issues: McpTranslationValidationIssue[];
    };

type McpUpdateTranslationResult =
  | {
      ok: true;
      value: McpUpdateTranslationDetail;
    }
  | McpTranslationMutationError;

export type McpSetTranslationStatusDetail = {
  targetText: string;
  status: McpTranslationStatus;
  sourcePath: string;
};

type McpSetTranslationStatusResult =
  | {
      ok: true;
      value: McpSetTranslationStatusDetail;
    }
  | McpTranslationMutationError;

/** Same empty-text and placeholder/ICU checks used before save or approve. */
export function validateMcpTranslationTarget(input: {
  sourceText: string;
  targetText: string;
  messageFormat: MessageFormat | null;
  requireNonEmpty: boolean;
}): McpTranslationValidationIssue[] {
  if (input.requireNonEmpty && !input.targetText.trim()) {
    return [{ kind: "empty-target" }];
  }

  return compareCatMessageFormats(
    analyzeCatMessageFormat(input.sourceText, { messageFormat: input.messageFormat }),
    analyzeCatMessageFormat(input.targetText, { messageFormat: input.messageFormat }),
  ).filter((issue) => issue.kind !== "extra-token");
}

async function collectMcpTranslationValidationIssues(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  sourceText: string;
  targetText: string;
  requireNonEmpty: boolean;
}): Promise<McpTranslationValidationIssue[]> {
  if (input.requireNonEmpty && !input.targetText.trim()) {
    return [{ kind: "empty-target" }];
  }

  const messageFormat = await getRepositorySourceFileMessageFormat({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });

  return validateMcpTranslationTarget({
    sourceText: input.sourceText,
    targetText: input.targetText,
    messageFormat,
    requireNonEmpty: false,
  });
}

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

  const issues = await collectMcpTranslationValidationIssues({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: detail.segment.sourcePath,
    sourceText: detail.segment.sourceText,
    targetText: input.targetText,
    requireNonEmpty: Boolean(input.approve),
  });

  if (issues.length > 0) {
    return {
      ok: false,
      error: "invalid_translation",
      issues,
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

  if (input.approve) {
    await enqueueStringSegmentApprovedActivity({
      ...mcpActivityActor(input.actorUserId),
      organizationId: input.organizationId,
      projectId: input.projectId,
      segmentId: input.translationKeyId,
      sourcePath: detail.segment.sourcePath,
      targetLocale: input.targetLocale,
    });
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

export async function setMcpTranslationStatus(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  targetLocale: string;
  status: McpTranslationStatus;
  actorUserId: string;
}): Promise<McpSetTranslationStatusResult> {
  const detail = await getNativeProjectContentEditorSegmentDetail({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyId: input.translationKeyId,
    targetLocale: input.targetLocale,
  });

  if (!detail?.target) {
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

  if (input.status === "approved") {
    const issues = await collectMcpTranslationValidationIssues({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: detail.segment.sourcePath,
      sourceText: detail.segment.sourceText,
      targetText: detail.target.text,
      requireNonEmpty: true,
    });

    if (issues.length > 0) {
      return {
        ok: false,
        error: "invalid_translation",
        issues,
      };
    }
  }

  const translation = await updateNativeProjectTranslationStatus({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyId: input.translationKeyId,
    targetLocale: input.targetLocale,
    status: input.status,
    actorUserId: input.actorUserId,
  });

  if (!translation) {
    return {
      ok: false,
      error: "translation_not_found",
    };
  }

  return {
    ok: true,
    value: {
      targetText: translation.text,
      status: input.status,
      sourcePath: detail.segment.sourcePath,
    },
  };
}
