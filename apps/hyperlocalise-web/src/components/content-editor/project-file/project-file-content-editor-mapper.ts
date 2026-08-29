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
import type {
  ProjectFileContentEditorComment,
  ProjectFileContentEditorQueueFile,
  ProjectFileContentEditorTranslation,
} from "@/api/routes/project/project.schema";
import {
  analyzeCatMessageFormat,
  compareCatMessageFormats,
} from "@/components/content-editor/message-format/content-editor-message-format";
import type { ContentEditorMessageParityIssue } from "@/components/content-editor/message-format/content-editor-message-format";
import {
  localizeCatMessageParityIssue,
  type ContentEditorFormatMessageIntl,
} from "@/components/content-editor/message-format/content-editor-message-format-i18n";
import { glossaryFormatChecksForSegment } from "@/components/content-editor/intelligence/content-editor-glossary-checks";
import type {
  ContentEditorFileContext,
  ContentEditorFormatCheck,
  ContentEditorGlossaryTerm,
  ContentEditorQueueSegment,
  ContentEditorSegment,
  ContentEditorSegmentComment,
  ContentEditorSegmentIntelligence,
  ContentEditorWorkspaceState,
} from "@/components/content-editor/shared/types";

import { projectFileCatMapperMessages } from "./project-file-content-editor-mapper.messages";

type ContentEditorFile = ProjectFileContentEditorQueueFile;

export function mapSegmentComments(
  comments: ProjectFileContentEditorComment[],
): ContentEditorSegmentComment[] {
  return comments.map((comment) => ({
    id: comment.externalCommentId,
    type: comment.type,
    status: comment.status,
    text: comment.text,
    createdAt: comment.createdAt,
    locale: comment.locale,
    author: comment.author ?? null,
  }));
}

export function segmentStatusFromTarget(
  segment: Pick<ContentEditorSegment, "hasOpenIssues">,
  target: ProjectFileContentEditorTranslation | null,
): ContentEditorSegment["status"] {
  if (target?.isApproved) {
    return "reviewed";
  }

  if (segment.hasOpenIssues) {
    return "needs_review";
  }

  return target?.text.trim() ? "needs_review" : "pending";
}

export function formatCheckFromParityIssue(
  issue: ContentEditorMessageParityIssue,
  index: number,
  intl: ContentEditorFormatMessageIntl,
): ContentEditorFormatCheck {
  const localized = localizeCatMessageParityIssue(issue, intl);

  return {
    id: `format-${issue.kind}-${index}`,
    label: localized.label,
    status: issue.kind === "extra-token" ? "warn" : "fail",
    message: localized.message,
    category:
      issue.kind === "parse-error"
        ? "syntax"
        : issue.kind === "icu-mismatch"
          ? "icu"
          : "placeholder",
    relatedTokens: issue.tokens,
  };
}

export function formatCheckForSegment(
  segment: ContentEditorSegment,
  value: string,
  intl: ContentEditorFormatMessageIntl,
  glossaryTerms: ContentEditorGlossaryTerm[] = [],
): ContentEditorFormatCheck[] {
  const checks: ContentEditorFormatCheck[] = [];
  const sourceAnalysis = analyzeCatMessageFormat(segment.sourceText);
  const targetAnalysis = analyzeCatMessageFormat(value);
  const parityIssues = compareCatMessageFormats(sourceAnalysis, targetAnalysis);

  if (parityIssues.length === 0) {
    checks.push({
      id: "format-parity",
      label:
        sourceAnalysis.tokens.length > 0
          ? intl.formatMessage(projectFileCatMapperMessages.placeholdersAndIcuLabel)
          : intl.formatMessage(projectFileCatMapperMessages.formatLabel),
      status: "pass",
      message:
        sourceAnalysis.tokens.length > 0
          ? intl.formatMessage(projectFileCatMapperMessages.placeholdersPassMessage)
          : intl.formatMessage(projectFileCatMapperMessages.noPlaceholdersMessage),
      category: "placeholder",
    });
  } else {
    checks.push(
      ...parityIssues.map((issue, index) => formatCheckFromParityIssue(issue, index, intl)),
    );
  }

  if (segment.maxLength && value.length > segment.maxLength) {
    checks.unshift({
      id: "length",
      label: intl.formatMessage(projectFileCatMapperMessages.lengthLabel),
      status: "fail",
      message: intl.formatMessage(projectFileCatMapperMessages.lengthExceededMessage, {
        maxLength: segment.maxLength,
      }),
      category: "length",
    });
  }

  if (glossaryTerms.length > 0) {
    checks.push(...glossaryFormatChecksForSegment(segment.sourceText, value, glossaryTerms, intl));
  }

  return checks;
}

export async function validateSegmentFormat(
  segment: ContentEditorSegment,
  value: string,
  intl: ContentEditorFormatMessageIntl,
  glossaryTerms: ContentEditorGlossaryTerm[] = [],
) {
  return formatCheckForSegment(segment, value, intl, glossaryTerms);
}

function intelligenceFor(
  contentEditorFile: ContentEditorFile,
  intl: ContentEditorFormatMessageIntl,
): ContentEditorSegmentIntelligence {
  const providerKind = contentEditorFile.provider?.kind;

  return {
    intent: intl.formatMessage(projectFileCatMapperMessages.fileIntent, {
      filename: contentEditorFile.filename,
      targetLocale: contentEditorFile.targetLocale,
    }),
    locationBreadcrumb: contentEditorFile.sourcePath,
    filePath: contentEditorFile.sourcePath,
    componentName: contentEditorFile.provider?.format ?? providerKind ?? undefined,
    reviewerPreference: contentEditorFile.canEditTranslations
      ? providerKind
        ? intl.formatMessage(projectFileCatMapperMessages.approveWritesToProvider)
        : intl.formatMessage(projectFileCatMapperMessages.approveSavesTarget)
      : intl.formatMessage(projectFileCatMapperMessages.readOnlyRolePreference),
    constraints: contentEditorFile.truncated
      ? intl.formatMessage(projectFileCatMapperMessages.moreStringsAvailable)
      : undefined,
    glossaryTerms: [],
    translationMemoryMatches: [],
  };
}

function segmentIntelligenceFor(
  contentEditorFile: ContentEditorFile,
  segment: ContentEditorFile["segments"][number],
  intl: ContentEditorFormatMessageIntl,
): ContentEditorSegmentIntelligence {
  const context = segment.context?.trim();
  const providerKind = contentEditorFile.provider?.kind;
  const segmentType = segment.type?.trim() || undefined;
  const maxLength =
    segment.maxLength != null && segment.maxLength > 0 ? segment.maxLength : undefined;

  const segmentFormat = segment.format?.trim() || undefined;

  return {
    intent: intl.formatMessage(projectFileCatMapperMessages.segmentIntent, {
      key: segment.key,
      targetLocale: contentEditorFile.targetLocale,
    }),
    locationBreadcrumb: segment.key,
    filePath: segment.sourcePath ?? contentEditorFile.sourcePath,
    componentName:
      segmentType ??
      segmentFormat ??
      contentEditorFile.provider?.format ??
      providerKind ??
      undefined,
    productMeaning: context || undefined,
    ...(segmentType ? { segmentType } : {}),
    ...(maxLength != null ? { maxLength } : {}),
    reviewerPreference: contentEditorFile.canEditTranslations
      ? providerKind
        ? intl.formatMessage(projectFileCatMapperMessages.approveWritesToProvider)
        : intl.formatMessage(projectFileCatMapperMessages.approveSavesTarget)
      : intl.formatMessage(projectFileCatMapperMessages.readOnlyRolePreference),
    constraints: contentEditorFile.truncated
      ? intl.formatMessage(projectFileCatMapperMessages.moreStringsAvailable)
      : undefined,
    glossaryTerms: [],
    translationMemoryMatches: [],
  };
}

function fileContextFor(
  contentEditorFile: ContentEditorFile,
  sourceLocale: string,
): ContentEditorFileContext {
  const providerKind = contentEditorFile.provider?.kind ?? null;

  return {
    sourcePath: contentEditorFile.sourcePath,
    filename: contentEditorFile.filename,
    sourceLocale,
    targetLocale: contentEditorFile.targetLocale,
    providerKind,
    canEditTranslations: contentEditorFile.canEditTranslations,
    canAddComments: Boolean(contentEditorFile.canEditTranslations),
    truncated: contentEditorFile.truncated,
    teamGlossaries: contentEditorFile.teamGlossaries ?? [],
    contributorTeams: contentEditorFile.contributorTeams ?? [],
    ...(contentEditorFile.projectTeamId ? { projectTeamId: contentEditorFile.projectTeamId } : {}),
    canContributeTeamGlossary:
      Boolean(contentEditorFile.canContributeTeamGlossary) && providerKind == null,
    ...(contentEditorFile.teamName ? { teamName: contentEditorFile.teamName } : {}),
    ...(contentEditorFile.projectTeamSlug
      ? { projectTeamSlug: contentEditorFile.projectTeamSlug }
      : {}),
  };
}

export function projectFileCatToWorkspaceState(
  contentEditorFile: ContentEditorFile,
  sourceLocale: string,
  intl: ContentEditorFormatMessageIntl,
): ContentEditorWorkspaceState {
  const fileContext = fileContextFor(contentEditorFile, sourceLocale);
  const segmentOffset = contentEditorFile.pagination?.offset ?? 0;
  const segments: ContentEditorQueueSegment[] = contentEditorFile.segments.map(
    (segment, index) => ({
      id: segment.externalStringId,
      index: segmentOffset + index + 1,
      key: segment.key,
      sourceText: segment.sourceText,
      ...(segment.contentKind ? { contentKind: segment.contentKind } : {}),
      ...(segment.sourceAssetUrl !== undefined ? { sourceAssetUrl: segment.sourceAssetUrl } : {}),
      ...(segment.targetAssetUrl !== undefined ? { targetAssetUrl: segment.targetAssetUrl } : {}),
      ...(segment.imageVariantId !== undefined ? { imageVariantId: segment.imageVariantId } : {}),
      ...(segment.looksLikeImageUrl !== undefined
        ? { looksLikeImageUrl: segment.looksLikeImageUrl }
        : {}),
      ...(segment.looksLikeVideoUrl !== undefined
        ? { looksLikeVideoUrl: segment.looksLikeVideoUrl }
        : {}),
      ...(segment.isHidden ? { isHidden: true } : {}),
      ...(segment.isLocked ? { isLocked: true } : {}),
      ...(segment.sourcePath ? { sourcePath: segment.sourcePath } : {}),
      ...(segment.externalResourceId ? { externalResourceId: segment.externalResourceId } : {}),
      ...(segment.resourceType ? { resourceType: segment.resourceType } : {}),
    }),
  );

  return {
    fileContext,
    queueSegments: segments,
    selectedSegmentId: segments[0]?.id ?? "",
    formatChecks: [],
    segmentFormatChecks: {},
    intelligence: intelligenceFor(contentEditorFile, intl),
    segmentIntelligence: Object.fromEntries(
      contentEditorFile.segments.map((segment) => [
        segment.externalStringId,
        segmentIntelligenceFor(contentEditorFile, segment, intl),
      ]),
    ),
    breadcrumbs: [
      contentEditorFile.provider?.kind ?? "native",
      contentEditorFile.filename,
      contentEditorFile.targetLocale,
    ],
    primaryActionLabel: contentEditorFile.provider
      ? intl.formatMessage(projectFileCatMapperMessages.saveToProvider)
      : intl.formatMessage(projectFileCatMapperMessages.approve),
    canEditTranslations: contentEditorFile.canEditTranslations,
    canAddComments: Boolean(contentEditorFile.canEditTranslations),
    providerKind: fileContext.providerKind,
  };
}

export function requireProviderExternalResourceId(
  contentEditorFile: ContentEditorFile | null | undefined,
  intl: ContentEditorFormatMessageIntl,
) {
  const externalResourceId = contentEditorFile?.provider?.externalResourceId;
  if (!externalResourceId) {
    throw new Error(intl.formatMessage(projectFileCatMapperMessages.missingProviderFileId));
  }

  return externalResourceId;
}

export function resolveCatFileIdentity(input: {
  externalResourceId?: string | null;
  resourceType?: "file" | "key" | null;
  contentEditorFile?: ContentEditorFile | null;
}) {
  return {
    externalResourceId:
      input.externalResourceId ?? input.contentEditorFile?.provider?.externalResourceId ?? null,
    resourceType: input.resourceType ?? input.contentEditorFile?.provider?.resourceType,
  };
}
