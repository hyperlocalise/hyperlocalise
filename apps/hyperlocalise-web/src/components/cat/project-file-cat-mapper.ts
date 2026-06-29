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

type CatFile = ProjectFileCatResponse["catFile"];

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

  if (segment.comments.some((comment) => comment.type === "issue")) {
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
    productMeaning:
      supportsComments && commentCount > 0
        ? `${commentCount} ${isNativeProject ? "" : "provider "}comment${commentCount === 1 ? "" : "s"} are attached to this file${!isNativeProject && providerKind === "crowdin" && issueCount > 0 ? `, including ${issueCount} issue${issueCount === 1 ? "" : "s"}` : isNativeProject && issueCount > 0 ? `, including ${issueCount} issue${issueCount === 1 ? "" : "s"}` : ""}.`
        : supportsComments
          ? isNativeProject
            ? "No comments are attached to this file yet."
            : "The provider did not return comments for this file."
          : undefined,
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
  const comments = segment.comments.length;
  const issues = segment.comments.filter((comment) => comment.type === "issue").length;
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
      (supportsComments && comments > 0
        ? `${comments} ${isNativeProject ? "" : "provider "}comment${comments === 1 ? "" : "s"} ${comments === 1 ? "is" : "are"} attached to this string${!isNativeProject && providerKind === "crowdin" && issues > 0 ? `, including ${issues} issue${issues === 1 ? "" : "s"}` : isNativeProject && issues > 0 ? `, including ${issues} issue${issues === 1 ? "" : "s"}` : ""}.`
        : supportsComments
          ? isNativeProject
            ? "No comments are attached to this string yet."
            : "The provider did not return context or comments for this string."
          : undefined),
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
  const segments = catFile.segments.map((segment, index): CatSegment => {
    const comments = segment.comments.length;
    const issueComments = segment.comments.filter((comment) => comment.type === "issue").length;
    const tags = [
      segment.type,
      comments > 0 ? `${comments} comment${comments === 1 ? "" : "s"}` : null,
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
    queueSummary: catFile.queueSummary,
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

export function requireProviderExternalResourceId(catFile: CatFile | null | undefined) {
  const externalResourceId = catFile?.provider?.externalResourceId;
  if (!externalResourceId) {
    throw new Error("Cannot save translation because the provider file identifier is missing.");
  }

  return externalResourceId;
}
