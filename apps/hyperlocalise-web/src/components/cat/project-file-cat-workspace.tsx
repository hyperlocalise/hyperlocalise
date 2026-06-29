"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useIntl } from "react-intl";

import type {
  ProjectFileCatConcordanceResponse,
  ProjectFileCatComment,
  ProjectFileCatRecommendationResponse,
  ProjectFileCatTranslation,
  ProjectFileCatVisualContextResponse,
} from "@/api/routes/project/project.schema";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { mapCatConcordanceForAiRecommendation } from "@/lib/translation/map-cat-concordance-for-ai-recommendation";
import { cn } from "@/lib/primitives/cn";

import { CatWorkspaceContainer } from "./cat-workspace-container";
import { buildCatSegmentShareUrl } from "./cat-segment-share-link";
import { resolveAvailableCatQueueFilters } from "./cat-queue-filter";
import {
  projectFileCatToWorkspaceState,
  requireProviderExternalResourceId,
  validateSegmentFormat,
} from "./project-file-cat-mapper";
import { useCatSegmentQuery } from "./use-cat-segment-query";
import type {
  CatGlossaryTerm,
  CatSegment,
  CatSegmentCommentInput,
  CatSegmentIntelligence,
  CrowdinIssueType,
} from "./types";

function initialTargetLocale(targetLocales: string[], highlightLocale: string | null) {
  if (highlightLocale && targetLocales.includes(highlightLocale)) {
    return highlightLocale;
  }

  return targetLocales[0] ?? "";
}

export function ProjectFileCatWorkspace({
  organizationSlug,
  projectId,
  sourcePath,
  targetLocale: targetLocaleProp,
  targetLocales,
  highlightLocale = null,
  repositoryFullName = null,
  initialSegmentKey = null,
  layout = "default",
  className,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale?: string;
  targetLocales?: string[];
  highlightLocale?: string | null;
  repositoryFullName?: string | null;
  initialSegmentKey?: string | null;
  layout?: "default" | "fullscreen";
  className?: string;
}) {
  const intl = useIntl();
  const [targetLocaleState, setTargetLocaleState] = useState(
    () => targetLocaleProp ?? initialTargetLocale(targetLocales ?? [], highlightLocale),
  );

  useEffect(() => {
    if (targetLocaleProp) {
      setTargetLocaleState(targetLocaleProp);
      return;
    }

    setTargetLocaleState((current) => {
      const locales = targetLocales ?? [];
      if (current && locales.includes(current)) {
        return current;
      }

      return initialTargetLocale(locales, highlightLocale);
    });
  }, [highlightLocale, targetLocaleProp, targetLocales]);

  const targetLocale = targetLocaleProp ?? targetLocaleState;
  const showLocaleSelector = !targetLocaleProp && (targetLocales?.length ?? 0) > 0;

  const {
    catQuery,
    search,
    setSearch,
    queueFilter,
    setQueueFilter,
    debouncedSearch,
    isSearchPending,
    pagination,
    prefetchNextPage,
    invalidateCurrentPage,
    goToPreviousPage,
    goToNextPage,
  } = useCatSegmentQuery({
    organizationSlug,
    projectId,
    sourcePath,
    targetLocale,
    repositoryFullName,
    enabled: Boolean(targetLocale),
  });

  const availableQueueFilters = useMemo(
    () => resolveAvailableCatQueueFilters(catQuery.data?.provider?.kind),
    [catQuery.data?.provider?.kind],
  );

  useEffect(() => {
    if (availableQueueFilters.includes(queueFilter)) {
      return;
    }

    setQueueFilter("all");
  }, [availableQueueFilters, queueFilter, setQueueFilter]);

  const saveMutation = useMutation({
    mutationFn: async (input: { externalStringId: string; text: string }) => {
      const externalResourceId = catQuery.data?.provider
        ? requireProviderExternalResourceId(catQuery.data)
        : undefined;

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
      await invalidateCurrentPage();
    },
  });
  const saveTranslation = saveMutation.mutateAsync;

  const commentMutation = useMutation({
    mutationFn: async (input: {
      externalStringId: string;
      text: string;
      type?: "comment" | "issue";
      issueType?: CrowdinIssueType;
    }) => {
      const externalResourceId = catQuery.data?.provider
        ? requireProviderExternalResourceId(catQuery.data)
        : undefined;

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.comments.$post({
        param: { organizationSlug, projectId },
        json: {
          sourcePath,
          targetLocale,
          externalStringId: input.externalStringId,
          externalResourceId,
          text: input.text,
          type: input.type,
          issueType: input.issueType,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to post comment"));
      }

      const body = (await response.json()) as { comment: ProjectFileCatComment };
      return body.comment;
    },
    onSuccess: async () => {
      await invalidateCurrentPage();
    },
  });
  const postComment = commentMutation.mutateAsync;

  const resolveCommentMutation = useMutation({
    mutationFn: async (input: { externalCommentId: string }) => {
      const externalResourceId = catQuery.data?.provider
        ? requireProviderExternalResourceId(catQuery.data)
        : undefined;

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.comments[":commentId"].resolve.$patch({
        param: {
          organizationSlug,
          projectId,
          commentId: input.externalCommentId,
        },
        json: {
          sourcePath,
          externalResourceId,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to resolve issue"));
      }

      const body = (await response.json()) as { comment: ProjectFileCatComment };
      return body.comment;
    },
    onSuccess: async () => {
      await invalidateCurrentPage();
    },
  });
  const resolveComment = resolveCommentMutation.mutateAsync;

  const workspaceState = useMemo(
    () => (catQuery.data ? projectFileCatToWorkspaceState(catQuery.data, intl) : null),
    [catQuery.data, intl],
  );

  const validateFormat = useCallback(
    (segment: CatSegment, value: string, glossaryTerms: CatGlossaryTerm[] = []) =>
      validateSegmentFormat(segment, value, intl, glossaryTerms),
    [intl],
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

  const handleAddComment = useCallback(
    async (segmentId: string, input: CatSegmentCommentInput) => {
      if (!catQuery.data?.canEditTranslations) {
        throw new Error("Your role cannot post comments to the provider.");
      }

      await postComment({
        externalStringId: segmentId,
        text: input.text,
        type: input.type,
        issueType: input.issueType,
      });
    },
    [catQuery.data?.canEditTranslations, postComment],
  );

  const handleResolveComment = useCallback(
    async (_segmentId: string, commentId: string) => {
      if (!catQuery.data?.canEditTranslations) {
        throw new Error("Your role cannot resolve issues in the provider.");
      }

      await resolveComment({ externalCommentId: commentId });
    },
    [catQuery.data?.canEditTranslations, resolveComment],
  );

  const handleBulkApprove = useCallback(
    async (segmentIds: string[]) => {
      for (const segmentId of segmentIds) {
        const segment = workspaceState?.segments.find((item) => item.id === segmentId);
        if (!segment) {
          continue;
        }

        await handleApprove(segmentId, segment.targetText);
      }
    },
    [handleApprove, workspaceState?.segments],
  );

  const buildSegmentShareUrl = useCallback((segment: CatSegment) => {
    if (typeof window === "undefined") {
      return null;
    }

    return buildCatSegmentShareUrl({
      baseUrl: window.location.href,
      segmentId: segment.id,
      segmentKey: segment.key,
    });
  }, []);

  const lookupSegmentContext = useCallback(
    async (segment: CatSegment) => {
      if (!repositoryFullName) {
        throw new Error("Select a GitHub repository before looking up string context.");
      }

      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files[
        "string-context"
      ].$post({
        param: { organizationSlug, projectId },
        json: {
          sourcePath,
          repositoryFullName,
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
    [organizationSlug, projectId, repositoryFullName, sourcePath],
  );

  const lookupSegmentConcordance = useCallback(
    async (segment: CatSegment) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.concordance.$post({
        param: { organizationSlug, projectId },
        json: {
          sourceLocale: segment.sourceLocale,
          targetLocale: segment.targetLocale,
          sourceText: segment.sourceText,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to search glossary and TM"));
      }

      const body = (await response.json()) as ProjectFileCatConcordanceResponse;
      return body.concordance;
    },
    [organizationSlug, projectId],
  );

  const lookupSegmentVisualContext = useCallback(
    async (segment: CatSegment) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat["visual-context"].$post({
        param: { organizationSlug, projectId },
        json: {
          sourcePath,
          externalStringId: segment.id,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to load in-context preview"));
      }

      const body = (await response.json()) as ProjectFileCatVisualContextResponse;
      return body.visualContext;
    },
    [organizationSlug, projectId, sourcePath],
  );

  const generateAiRecommendation = useCallback(
    async (segment: CatSegment, targetText: string, intelligence?: CatSegmentIntelligence) => {
      const concordancePayload =
        intelligence != null
          ? mapCatConcordanceForAiRecommendation(
              {
                glossaryTerms: intelligence.glossaryTerms ?? [],
                translationMemoryMatches: intelligence.translationMemoryMatches ?? [],
              },
              segment.targetLocale,
            )
          : {};

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.recommendation.$post({
        param: { organizationSlug, projectId },
        json: {
          sourcePath,
          targetLocale,
          sourceLocale: segment.sourceLocale,
          key: segment.key,
          sourceText: segment.sourceText,
          targetText,
          context: segment.contextLabel ?? intelligence?.productMeaning ?? null,
          agentContext: intelligence?.agentContext ?? null,
          maxLength: segment.maxLength,
          ...concordancePayload,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to generate AI recommendation"));
      }

      const body = (await response.json()) as ProjectFileCatRecommendationResponse;
      return body.recommendation;
    },
    [organizationSlug, projectId, sourcePath, targetLocale],
  );

  if (showLocaleSelector && (targetLocales?.length ?? 0) === 0) {
    return (
      <TypographyP className="text-sm text-muted-foreground">
        No target locales are available for this file.
      </TypographyP>
    );
  }

  const isFullscreen = layout === "fullscreen";

  if (catQuery.isLoading && !catQuery.data) {
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
          {search.trim()
            ? "No strings match your search."
            : queueFilter !== "all"
              ? "No segments match this filter."
              : "No source strings are available for this file."}
        </TypographyP>
      </div>
    );
  }

  return (
    <div
      className={cn(
        isFullscreen ? "flex h-full min-h-0 flex-1 flex-col gap-3" : "space-y-3",
        className,
      )}
    >
      {showLocaleSelector ? (
        <div className="flex w-full flex-col gap-1.5 sm:max-w-44">
          <TypographyP className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Target locale
          </TypographyP>
          <Select
            value={targetLocale}
            onValueChange={(value) => {
              if (value) {
                setTargetLocaleState(value);
              }
            }}
          >
            <SelectTrigger className="h-9 w-full font-mono text-xs">
              <SelectValue placeholder="Select locale" />
            </SelectTrigger>
            <SelectContent>
              {(targetLocales ?? []).map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {locale}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <CatWorkspaceContainer
        key={`${sourcePath}:${targetLocale}:${repositoryFullName ?? "default"}:${debouncedSearch}:${queueFilter}:${pagination?.offset ?? 0}`}
        initialState={workspaceState}
        className={cn("min-h-0 flex-1", isFullscreen && "rounded-lg border border-border")}
        services={{
          validateFormat,
          lookupSegmentConcordance,
          lookupSegmentVisualContext:
            catQuery.data?.provider?.kind && catQuery.data.provider.kind !== "native"
              ? lookupSegmentVisualContext
              : undefined,
          generateAiRecommendation,
          ...(repositoryFullName ? { lookupSegmentContext } : {}),
        }}
        review={{
          onApprove: handleApprove,
          onAddComment: handleAddComment,
          onResolveComment:
            catQuery.data?.provider?.kind === "crowdin" ? handleResolveComment : undefined,
          onBulkApprove: handleBulkApprove,
        }}
        initialSegmentKeyOrId={initialSegmentKey}
        buildSegmentShareUrl={buildSegmentShareUrl}
        queueSearch={search}
        onQueueSearchChange={setSearch}
        queueFilter={queueFilter}
        onQueueFilterChange={setQueueFilter}
        availableQueueFilters={availableQueueFilters}
        isQueueSearchPending={isSearchPending}
        isQueueFetchingPage={catQuery.isFetching && !catQuery.isLoading}
        queuePagination={pagination}
        onQueuePreviousPage={goToPreviousPage}
        onQueueNextPage={goToNextPage}
        onQueueNearEnd={prefetchNextPage}
      />
    </div>
  );
}
