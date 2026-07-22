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
import type {
  ProjectFileCatComment,
  ProjectFileCatQueueFile,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import {
  analyzeCatMessageFormat,
  compareCatMessageFormats,
} from "@/components/cat/message-format/cat-message-format";
import type { CatMessageParityIssue } from "@/components/cat/message-format/cat-message-format";
import {
  localizeCatMessageParityIssue,
  type CatFormatMessageIntl,
} from "@/components/cat/message-format/cat-message-format-i18n";
import { glossaryFormatChecksForSegment } from "@/components/cat/intelligence/cat-glossary-checks";
import type {
  CatFileContext,
  CatFormatCheck,
  CatGlossaryTerm,
  CatQueueSegment,
  CatSegment,
  CatSegmentComment,
  CatSegmentIntelligence,
  CatWorkspaceState,
} from "@/components/cat/shared/types";

import { projectFileCatMapperMessages } from "./project-file-cat-mapper.messages";

type CatFile = ProjectFileCatQueueFile;

export function mapSegmentComments(comments: ProjectFileCatComment[]): CatSegmentComment[] {
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
  segment: Pick<CatSegment, "hasOpenIssues">,
  target: ProjectFileCatTranslation | null,
): CatSegment["status"] {
  if (target?.isApproved) {
    return "reviewed";
  }

  if (segment.hasOpenIssues) {
    return "needs_review";
  }

  return target?.text.trim() ? "needs_review" : "pending";
}

export function formatCheckFromParityIssue(
  issue: CatMessageParityIssue,
  index: number,
  intl: CatFormatMessageIntl,
): CatFormatCheck {
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
  segment: CatSegment,
  value: string,
  intl: CatFormatMessageIntl,
  glossaryTerms: CatGlossaryTerm[] = [],
): CatFormatCheck[] {
  const checks: CatFormatCheck[] = [];
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
  segment: CatSegment,
  value: string,
  intl: CatFormatMessageIntl,
  glossaryTerms: CatGlossaryTerm[] = [],
) {
  return formatCheckForSegment(segment, value, intl, glossaryTerms);
}

function intelligenceFor(catFile: CatFile, intl: CatFormatMessageIntl): CatSegmentIntelligence {
  const providerKind = catFile.provider?.kind;

  return {
    intent: intl.formatMessage(projectFileCatMapperMessages.fileIntent, {
      filename: catFile.filename,
      targetLocale: catFile.targetLocale,
    }),
    locationBreadcrumb: catFile.sourcePath,
    filePath: catFile.sourcePath,
    componentName: catFile.provider?.format ?? providerKind ?? undefined,
    reviewerPreference: catFile.canEditTranslations
      ? providerKind
        ? intl.formatMessage(projectFileCatMapperMessages.approveWritesToProvider)
        : intl.formatMessage(projectFileCatMapperMessages.approveSavesTarget)
      : intl.formatMessage(projectFileCatMapperMessages.readOnlyRolePreference),
    constraints: catFile.truncated
      ? intl.formatMessage(projectFileCatMapperMessages.moreStringsAvailable)
      : undefined,
    glossaryTerms: [],
    translationMemoryMatches: [],
  };
}

function segmentIntelligenceFor(
  catFile: CatFile,
  segment: CatFile["segments"][number],
  intl: CatFormatMessageIntl,
): CatSegmentIntelligence {
  const context = segment.context?.trim();
  const providerKind = catFile.provider?.kind;
  const segmentType = segment.type?.trim() || undefined;
  const maxLength =
    segment.maxLength != null && segment.maxLength > 0 ? segment.maxLength : undefined;

  const segmentFormat = segment.format?.trim() || undefined;

  return {
    intent: intl.formatMessage(projectFileCatMapperMessages.segmentIntent, {
      key: segment.key,
      targetLocale: catFile.targetLocale,
    }),
    locationBreadcrumb: segment.key,
    filePath: segment.sourcePath ?? catFile.sourcePath,
    componentName:
      segmentType ?? segmentFormat ?? catFile.provider?.format ?? providerKind ?? undefined,
    productMeaning: context || undefined,
    ...(segmentType ? { segmentType } : {}),
    ...(maxLength != null ? { maxLength } : {}),
    reviewerPreference: catFile.canEditTranslations
      ? providerKind
        ? intl.formatMessage(projectFileCatMapperMessages.approveWritesToProvider)
        : intl.formatMessage(projectFileCatMapperMessages.approveSavesTarget)
      : intl.formatMessage(projectFileCatMapperMessages.readOnlyRolePreference),
    constraints: catFile.truncated
      ? intl.formatMessage(projectFileCatMapperMessages.moreStringsAvailable)
      : undefined,
    glossaryTerms: [],
    translationMemoryMatches: [],
  };
}

function fileContextFor(catFile: CatFile, sourceLocale: string): CatFileContext {
  const providerKind = catFile.provider?.kind ?? null;

  return {
    sourcePath: catFile.sourcePath,
    filename: catFile.filename,
    sourceLocale,
    targetLocale: catFile.targetLocale,
    providerKind,
    canEditTranslations: catFile.canEditTranslations,
    canAddComments: Boolean(catFile.canEditTranslations),
    truncated: catFile.truncated,
  };
}

export function projectFileCatToWorkspaceState(
  catFile: CatFile,
  sourceLocale: string,
  intl: CatFormatMessageIntl,
): CatWorkspaceState {
  const fileContext = fileContextFor(catFile, sourceLocale);
  const segmentOffset = catFile.pagination?.offset ?? 0;
  const segments: CatQueueSegment[] = catFile.segments.map((segment, index) => ({
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
    ...(segment.sourcePath ? { sourcePath: segment.sourcePath } : {}),
    ...(segment.externalResourceId ? { externalResourceId: segment.externalResourceId } : {}),
    ...(segment.resourceType ? { resourceType: segment.resourceType } : {}),
  }));

  return {
    fileContext,
    queueSegments: segments,
    selectedSegmentId: segments[0]?.id ?? "",
    formatChecks: [],
    segmentFormatChecks: {},
    intelligence: intelligenceFor(catFile, intl),
    segmentIntelligence: Object.fromEntries(
      catFile.segments.map((segment) => [
        segment.externalStringId,
        segmentIntelligenceFor(catFile, segment, intl),
      ]),
    ),
    breadcrumbs: [catFile.provider?.kind ?? "native", catFile.filename, catFile.targetLocale],
    primaryActionLabel: catFile.provider
      ? intl.formatMessage(projectFileCatMapperMessages.saveToProvider)
      : intl.formatMessage(projectFileCatMapperMessages.approve),
    canEditTranslations: catFile.canEditTranslations,
    canAddComments: Boolean(catFile.canEditTranslations),
    providerKind: fileContext.providerKind,
  };
}

export function requireProviderExternalResourceId(
  catFile: CatFile | null | undefined,
  intl: CatFormatMessageIntl,
) {
  const externalResourceId = catFile?.provider?.externalResourceId;
  if (!externalResourceId) {
    throw new Error(intl.formatMessage(projectFileCatMapperMessages.missingProviderFileId));
  }

  return externalResourceId;
}

export function resolveCatFileIdentity(input: {
  externalResourceId?: string | null;
  resourceType?: "file" | "key" | null;
  catFile?: CatFile | null;
}) {
  return {
    externalResourceId:
      input.externalResourceId ?? input.catFile?.provider?.externalResourceId ?? null,
    resourceType: input.resourceType ?? input.catFile?.provider?.resourceType,
  };
}
