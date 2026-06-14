"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ProjectFileCatResponse,
  ProjectFileCatSegment,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { CatWorkspaceContainer } from "@/components/cat";
import {
  analyzeCatMessageFormat,
  compareCatMessageFormats,
} from "@/components/cat/cat-message-format";
import type {
  CatFormatCheck,
  CatSegment,
  CatSegmentIntelligence,
  CatWorkspaceState,
} from "@/components/cat/types";
import { AlertCircleIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

type CatFile = ProjectFileCatResponse["catFile"];

export function requireProviderExternalResourceId(catFile: CatFile | null | undefined) {
  const externalResourceId = catFile?.provider?.externalResourceId;
  if (!externalResourceId) {
    throw new Error("Cannot save translation because the provider file identifier is missing.");
  }

  return externalResourceId;
}

function projectFileCatQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath: string,
  targetLocale: string,
) {
  return ["project-file-cat", organizationSlug, projectId, sourcePath, targetLocale] as const;
}

function segmentStatusFor(segment: ProjectFileCatSegment): CatSegment["status"] {
  if (segment.target?.isApproved) {
    return "reviewed";
  }

  if (segment.comments.some((comment) => comment.type === "issue")) {
    return "needs_review";
  }

  return segment.target?.text.trim() ? "needs_review" : "pending";
}

function formatCheckForSegment(segment: CatSegment, value: string): CatFormatCheck[] {
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
      ...parityIssues.map(
        (issue, index) =>
          ({
            id: `format-${issue.kind}-${index}`,
            label: issue.label,
            status: issue.kind === "extra-token" ? "warn" : "fail",
            message: issue.message,
            category:
              issue.kind === "parse-error"
                ? "syntax"
                : issue.kind === "icu-mismatch"
                  ? "icu"
                  : "placeholder",
            relatedTokens: issue.tokens,
          }) satisfies CatFormatCheck,
      ),
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

  return checks;
}

async function validateSegmentFormat(segment: CatSegment, value: string) {
  return formatCheckForSegment(segment, value);
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

  return {
    intent: `Translate ${catFile.filename} into ${catFile.targetLocale}.`,
    locationBreadcrumb: catFile.sourcePath,
    filePath: catFile.sourcePath,
    componentName: catFile.provider?.format ?? catFile.provider?.kind ?? undefined,
    productMeaning:
      commentCount > 0
        ? `${commentCount} Crowdin comment${commentCount === 1 ? "" : "s"} are attached to this file, including ${issueCount} issue${issueCount === 1 ? "" : "s"}.`
        : "Crowdin did not return comments or issues for this file.",
    reviewerPreference: catFile.canEditTranslations
      ? "Approve writes the current target text back to Crowdin."
      : "This role can inspect strings but cannot write translations back.",
    constraints: catFile.truncated ? "Showing the visible Crowdin segment window." : undefined,
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

  return {
    intent: `Translate ${segment.key} into ${catFile.targetLocale}.`,
    locationBreadcrumb: segment.key,
    filePath: catFile.sourcePath,
    componentName: segment.type ?? catFile.provider?.format ?? catFile.provider?.kind ?? undefined,
    productMeaning:
      context ||
      (comments > 0
        ? `${comments} Crowdin comment${comments === 1 ? "" : "s"} ${comments === 1 ? "is" : "are"} attached to this string, including ${issues} issue${issues === 1 ? "" : "s"}.`
        : "Crowdin did not return context, comments, or issues for this string."),
    agentContext: repositoryContext || undefined,
    reviewerPreference: catFile.canEditTranslations
      ? "Approve writes the current target text back to Crowdin."
      : "This role can inspect strings but cannot write translations back.",
    constraints: catFile.truncated ? "Showing the visible Crowdin segment window." : undefined,
    glossaryTerms: [],
    translationMemoryMatches: [],
  };
}

export function projectFileCatToWorkspaceState(catFile: CatFile): CatWorkspaceState {
  const sourceLocale = catFile.provider?.sourceLocale ?? "source";
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
      index: index + 1,
      key: segment.key,
      sourceText: segment.sourceText,
      targetText: segment.target?.text ?? "",
      sourceLocale,
      targetLocale: catFile.targetLocale,
      contextLabel: segment.context ?? undefined,
      status: segmentStatusFor(segment),
      tags,
    };
  });

  return {
    segments,
    selectedSegmentId: segments[0]?.id ?? "",
    queueSummary: {
      total: segments.length,
      reviewed: segments.filter((segment) => segment.status === "reviewed").length,
    },
    formatChecks: segments[0] ? formatCheckForSegment(segments[0], segments[0].targetText) : [],
    segmentFormatChecks: Object.fromEntries(
      segments.map((segment) => [segment.id, formatCheckForSegment(segment, segment.targetText)]),
    ),
    suggestions: [],
    intelligence: intelligenceFor(catFile),
    segmentIntelligence: Object.fromEntries(
      catFile.segments.map((segment) => [
        segment.externalStringId,
        segmentIntelligenceFor(catFile, segment),
      ]),
    ),
    breadcrumbs: [catFile.provider?.kind ?? "provider", catFile.filename, catFile.targetLocale],
    primaryActionLabel: "Save to Crowdin",
    canEditTranslations: catFile.canEditTranslations,
  };
}

export function TmsJobCatWorkspace({
  organizationSlug,
  projectId,
  sourcePath,
  targetLocale,
  className,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = projectFileCatQueryKey(organizationSlug, projectId, sourcePath, targetLocale);
  const catQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.$get({
        param: { organizationSlug, projectId },
        query: { sourcePath, targetLocale },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to load CAT workspace"));
      }

      const body = (await response.json()) as ProjectFileCatResponse;
      return body.catFile;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: { externalStringId: string; text: string }) => {
      const externalResourceId = requireProviderExternalResourceId(catQuery.data);

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.translations.$post({
        param: { organizationSlug, projectId },
        json: {
          sourcePath,
          targetLocale,
          externalStringId: input.externalStringId,
          externalResourceId,
          text: input.text,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to save translation"));
      }

      const body = (await response.json()) as { translation: ProjectFileCatTranslation };
      return body.translation;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const saveTranslation = saveMutation.mutateAsync;

  const workspaceState = useMemo(
    () => (catQuery.data ? projectFileCatToWorkspaceState(catQuery.data) : null),
    [catQuery.data],
  );
  const handleApprove = useCallback(
    async (segmentId: string, targetText: string) => {
      if (!catQuery.data?.canEditTranslations) {
        throw new Error("Your role cannot write translations back.");
      }

      const translation = await saveTranslation({
        externalStringId: segmentId,
        text: targetText,
      });
      return translation.isApproved ? "reviewed" : "needs_review";
    },
    [catQuery.data?.canEditTranslations, saveTranslation],
  );
  const lookupSegmentContext = useCallback(
    async (segment: CatSegment) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files[
        "string-context"
      ].$post({
        param: { organizationSlug, projectId },
        json: {
          sourcePath,
          key: segment.key,
          text: segment.sourceText,
          context: segment.contextLabel ?? null,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to look up repository context"));
      }

      const body = (await response.json()) as { stringContext: { summary: string } };
      return body.stringContext.summary;
    },
    [organizationSlug, projectId, sourcePath],
  );

  if (catQuery.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        <TypographyP className="text-sm">Loading CAT workspace...</TypographyP>
      </div>
    );
  }

  if (catQuery.isError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-flame-100">
        <AlertCircleIcon className="size-4" />
        <TypographyP className="text-sm">
          {catQuery.error instanceof Error
            ? catQuery.error.message
            : "Failed to load CAT workspace."}
        </TypographyP>
      </div>
    );
  }

  if (!workspaceState || workspaceState.segments.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <TypographyP className="text-sm">
          No source strings are available for this file.
        </TypographyP>
      </div>
    );
  }

  return (
    <CatWorkspaceContainer
      initialState={workspaceState}
      className={cn("min-h-0 flex-1", className)}
      services={{
        validateFormat: validateSegmentFormat,
        lookupSegmentContext,
      }}
      review={{
        onApprove: handleApprove,
      }}
    />
  );
}
