import type {
  ProjectFileCatResponse,
  ProjectFileCatSegment,
} from "@/api/routes/project/project.schema";
import {
  analyzeCatMessageFormat,
  compareCatMessageFormats,
} from "@/components/cat/cat-message-format";
import type { CatMessageParityIssue } from "@/components/cat/cat-message-format";
import {
  localizeCatMessageParityIssue,
  type CatFormatMessageIntl,
} from "@/components/cat/cat-message-format-i18n";
import { glossaryFormatChecksForSegment } from "@/components/cat/cat-glossary-checks";
import type {
  CatFormatCheck,
  CatGlossaryTerm,
  CatSegment,
  CatSegmentComment,
  CatSegmentIntelligence,
  CatWorkspaceState,
} from "@/components/cat/types";
import { isOpenIssueStatus } from "@/components/cat/cat-queue-filter";

type CatFile = ProjectFileCatResponse["catFile"];

function countOpenIssues(segment: ProjectFileCatSegment) {
  if (segment.comments.length > 0) {
    return segment.comments.filter(
      (comment) => comment.type === "issue" && isOpenIssueStatus(comment.status),
    ).length;
  }

  return segment.unresolvedIssueCount ?? 0;
}

function mapSegmentComments(segment: ProjectFileCatSegment): CatSegmentComment[] {
  return segment.comments.map((comment) => ({
    id: comment.externalCommentId,
    type: comment.type,
    status: comment.status,
    text: comment.text,
    createdAt: comment.createdAt,
    locale: comment.locale,
    author: comment.author ?? null,
  }));
}

export function segmentStatusFor(segment: ProjectFileCatSegment): CatSegment["status"] {
  if (segment.target?.isApproved) {
    return "reviewed";
  }

  const hasUnresolvedIssue = countOpenIssues(segment) > 0;

  if (hasUnresolvedIssue) {
    return "needs_review";
  }

  return segment.target?.text.trim() ? "needs_review" : "pending";
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
      label: sourceAnalysis.tokens.length > 0 ? "Placeholders & ICU" : "Format",
      status: "pass",
      message:
        sourceAnalysis.tokens.length > 0
          ? "Target keeps the required placeholders and ICU structure."
          : "No placeholders or ICU blocks detected.",
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
      label: "Length",
      status: "fail",
      message: `Translation exceeds ${segment.maxLength} characters.`,
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

function buildCommentIssueSuffix(
  issueCount: number,
  isNativeProject: boolean,
  providerKind?: string | null,
) {
  if (issueCount <= 0) {
    return "";
  }

  if (isNativeProject || providerKind === "crowdin") {
    return `, including ${issueCount} issue${issueCount === 1 ? "" : "s"}`;
  }

  return "";
}

function buildCommentProductMeaning(input: {
  supportsComments: boolean;
  commentCount: number;
  issueCount: number;
  isNativeProject: boolean;
  providerKind?: string | null;
  entity: "file" | "string";
}) {
  if (!input.supportsComments) {
    return undefined;
  }

  if (input.commentCount > 0) {
    const providerPrefix = input.isNativeProject ? "" : "provider ";
    const verb = input.entity === "file" ? "are" : input.commentCount === 1 ? "is" : "are";
    const issueSuffix = buildCommentIssueSuffix(
      input.issueCount,
      input.isNativeProject,
      input.providerKind,
    );

    return `${input.commentCount} ${providerPrefix}comment${input.commentCount === 1 ? "" : "s"} ${verb} attached to this ${input.entity}${issueSuffix}.`;
  }

  if (input.isNativeProject) {
    return `No comments are attached to this ${input.entity} yet.`;
  }

  return input.entity === "file"
    ? "The provider did not return comments for this file."
    : "The provider did not return context or comments for this string.";
}

function intelligenceFor(catFile: CatFile): CatSegmentIntelligence {
  const issueCount = catFile.segments.reduce(
    (count, segment) =>
      count + segment.comments.filter((comment) => comment.type === "issue").length,
    0,
  );
  const commentCount = catFile.segments.reduce(
    (count, segment) => count + segment.comments.length,
    0,
  );
  const providerKind = catFile.provider?.kind;
  const isNativeProject = !catFile.provider;
  const supportsComments =
    isNativeProject || providerKind === "crowdin" || providerKind === "phrase";

  return {
    intent: `Translate ${catFile.filename} into ${catFile.targetLocale}.`,
    locationBreadcrumb: catFile.sourcePath,
    filePath: catFile.sourcePath,
    componentName: catFile.provider?.format ?? providerKind ?? undefined,
    productMeaning: buildCommentProductMeaning({
      supportsComments,
      commentCount,
      issueCount,
      isNativeProject,
      providerKind,
      entity: "file",
    }),
    reviewerPreference: catFile.canEditTranslations
      ? providerKind
        ? "Approve writes the current target text back to the provider."
        : "Approve saves the current target text."
      : "This role can inspect strings but cannot write translations back.",
    constraints: catFile.truncated ? "More strings are available beyond this page." : undefined,
    glossaryTerms: [],
    translationMemoryMatches: [],
  };
}

function segmentIntelligenceFor(
  catFile: CatFile,
  segment: ProjectFileCatSegment,
): CatSegmentIntelligence {
  const comments = segment.comments.length || segment.commentCount || 0;
  const issues = countOpenIssues(segment);
  const context = segment.context?.trim();
  const repositoryContext = segment.repositoryContext?.trim();
  const providerKind = catFile.provider?.kind;
  const isNativeProject = !catFile.provider;
  const supportsComments =
    isNativeProject || providerKind === "crowdin" || providerKind === "phrase";

  return {
    intent: `Translate ${segment.key} into ${catFile.targetLocale}.`,
    locationBreadcrumb: segment.key,
    filePath: catFile.sourcePath,
    componentName: segment.type ?? catFile.provider?.format ?? providerKind ?? undefined,
    productMeaning:
      context ||
      buildCommentProductMeaning({
        supportsComments,
        commentCount: comments,
        issueCount: issues,
        isNativeProject,
        providerKind,
        entity: "string",
      }),
    agentContext: repositoryContext || undefined,
    reviewerPreference: catFile.canEditTranslations
      ? providerKind
        ? "Approve writes the current target text back to the provider."
        : "Approve saves the current target text."
      : "This role can inspect strings but cannot write translations back.",
    constraints: catFile.truncated ? "More strings are available beyond this page." : undefined,
    glossaryTerms: [],
    translationMemoryMatches: [],
  };
}

export function projectFileCatToWorkspaceState(
  catFile: CatFile,
  _intl: CatFormatMessageIntl,
): CatWorkspaceState {
  const sourceLocale = catFile.provider?.sourceLocale ?? "source";
  const segmentOffset = catFile.pagination?.offset ?? 0;
  const queueSummary = catFile.queueSummary ?? {
    total: 0,
    reviewed: 0,
    untranslated: 0,
    needsReview: 0,
    hasIssues: 0,
  };
  const segments = catFile.segments.map((segment, index): CatSegment => {
    const commentCount = segment.comments.length || segment.commentCount || 0;
    const issueComments = countOpenIssues(segment);
    const tags = [
      segment.type,
      commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? "" : "s"}` : null,
      issueComments > 0 ? `${issueComments} issue${issueComments === 1 ? "" : "s"}` : null,
    ].filter((tag): tag is string => Boolean(tag));

    return {
      id: segment.externalStringId,
      index: segmentOffset + index + 1,
      key: segment.key,
      sourceText: segment.sourceText,
      targetText: segment.target?.text ?? "",
      sourceLocale,
      targetLocale: catFile.targetLocale,
      contextLabel: segment.context ?? undefined,
      status: segmentStatusFor(segment),
      hasOpenIssues: issueComments > 0,
      tags,
      ...(segment.maxLength != null && segment.maxLength > 0
        ? { maxLength: segment.maxLength }
        : {}),
      comments: mapSegmentComments(segment),
    };
  });

  return {
    segments,
    selectedSegmentId: segments[0]?.id ?? "",
    queueSummary,
    formatChecks: [],
    segmentFormatChecks: {},
    intelligence: intelligenceFor(catFile),
    segmentIntelligence: Object.fromEntries(
      catFile.segments.map((segment) => [
        segment.externalStringId,
        segmentIntelligenceFor(catFile, segment),
      ]),
    ),
    breadcrumbs: [catFile.provider?.kind ?? "native", catFile.filename, catFile.targetLocale],
    primaryActionLabel: catFile.provider ? "Save to provider" : "Approve",
    canEditTranslations: catFile.canEditTranslations,
    canAddComments: Boolean(catFile.canEditTranslations),
    providerKind: catFile.provider?.kind ?? null,
  };
}

export function applyCatSegmentDetailToWorkspaceState(
  state: CatWorkspaceState,
  catFile: CatFile,
  segmentDetail: ProjectFileCatSegment,
  intl: CatFormatMessageIntl,
): CatWorkspaceState {
  const mergedSegment = {
    ...catFile.segments.find(
      (segment) => segment.externalStringId === segmentDetail.externalStringId,
    ),
    ...segmentDetail,
  };

  if (!mergedSegment.externalStringId) {
    return state;
  }

  const nextCatFile: CatFile = {
    ...catFile,
    segments: catFile.segments.map((segment) =>
      segment.externalStringId === segmentDetail.externalStringId ? mergedSegment : segment,
    ),
  };
  const detailState = projectFileCatToWorkspaceState(nextCatFile, intl);
  const detailSegment = detailState.segments.find(
    (segment) => segment.id === segmentDetail.externalStringId,
  );

  if (!detailSegment) {
    return state;
  }

  return {
    ...state,
    segments: state.segments.map((segment) =>
      segment.id === detailSegment.id ? detailSegment : segment,
    ),
    segmentIntelligence: {
      ...state.segmentIntelligence,
      [detailSegment.id]: detailState.segmentIntelligence?.[detailSegment.id] ?? {
        ...state.intelligence,
      },
    },
  };
}

export function requireProviderExternalResourceId(catFile: CatFile | null | undefined) {
  const externalResourceId = catFile?.provider?.externalResourceId;
  if (!externalResourceId) {
    throw new Error("Cannot save translation because the provider file identifier is missing.");
  }

  return externalResourceId;
}
