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
  const providerKind = catFile.provider?.kind;

  return {
    intent: `Translate ${catFile.filename} into ${catFile.targetLocale}.`,
    locationBreadcrumb: catFile.sourcePath,
    filePath: catFile.sourcePath,
    componentName: catFile.provider?.format ?? providerKind ?? undefined,
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
  segment: CatFile["segments"][number],
): CatSegmentIntelligence {
  const context = segment.context?.trim();
  const providerKind = catFile.provider?.kind;
  const segmentType = segment.type?.trim() || undefined;
  const maxLength =
    segment.maxLength != null && segment.maxLength > 0 ? segment.maxLength : undefined;

  return {
    intent: `Translate ${segment.key} into ${catFile.targetLocale}.`,
    locationBreadcrumb: segment.key,
    filePath: catFile.sourcePath,
    componentName: segmentType ?? catFile.provider?.format ?? providerKind ?? undefined,
    productMeaning: context || undefined,
    ...(segmentType ? { segmentType } : {}),
    ...(maxLength != null ? { maxLength } : {}),
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
  _intl: CatFormatMessageIntl,
): CatWorkspaceState {
  const fileContext = fileContextFor(catFile, sourceLocale);
  const segmentOffset = catFile.pagination?.offset ?? 0;
  const segments: CatQueueSegment[] = catFile.segments.map((segment, index) => ({
    id: segment.externalStringId,
    index: segmentOffset + index + 1,
    key: segment.key,
    sourceText: segment.sourceText,
  }));

  return {
    fileContext,
    queueSegments: segments,
    selectedSegmentId: segments[0]?.id ?? "",
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
    providerKind: fileContext.providerKind,
  };
}

export function requireProviderExternalResourceId(catFile: CatFile | null | undefined) {
  const externalResourceId = catFile?.provider?.externalResourceId;
  if (!externalResourceId) {
    throw new Error("Cannot save translation because the provider file identifier is missing.");
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
