"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircleIcon } from "lucide-react";
import { useIntl } from "react-intl";

import type {
  ProjectFileCatConcordanceResponse,
  ProjectFileCatRecommendationResponse,
  ProjectFileCatVisualContextResponse,
} from "@/api/routes/project/project.schema";
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

import { resolveAvailableCatQueueFilters } from "@/components/cat/queue/cat-queue-filter";
import { buildCatSegmentShareUrl } from "@/components/cat/segment/cat-segment-share-link";
import type {
  CatGlossaryTerm,
  CatSegment,
  CatSegmentCommentInput,
  CatSegmentIntelligence,
} from "@/components/cat/shared/types";
import { CatWorkspaceContainer } from "@/components/cat/workspace/cat-workspace-container";
import { CatWorkspaceSkeleton } from "@/components/cat/workspace/cat-workspace-skeleton";

import {
  applyCatSegmentCommentsToWorkspaceState,
  applyCatSegmentTargetToWorkspaceState,
  projectFileCatToWorkspaceState,
  validateSegmentFormat,
} from "./project-file-cat-mapper";
import { useCatMutations } from "./use-cat-mutations";
import { useCatSegmentComments } from "./use-cat-segment-comments";
import { useCatSegmentTarget } from "./use-cat-segment-target";
import { useCatSegmentQuery } from "./use-cat-segment-query";

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
  externalResourceId = null,
  resourceType,
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
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale?: string;
  targetLocales?: string[];
  highlightLocale?: string | null;
  repositoryFullName?: string | null;
  initialSegmentKey?: string | null;
  layout?: "default" | "fullscreen";
  className?: string;
}) {
  const intl = useIntl();
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
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
    catFile,
    search,
    setSearch,
    queueFilter,
    setQueueFilter,
    debouncedSearch,
    isSearchPending,
    pagination,
    loadNextPage,
    invalidateQueue,
    isFetchingNextPage,
  } = useCatSegmentQuery({
    organizationSlug,
    projectId,
    sourcePath,
    externalResourceId,
    resourceType,
    targetLocale,
    repositoryFullName,
    enabled: Boolean(targetLocale),
  });

  const availableQueueFilters = useMemo(
    () => resolveAvailableCatQueueFilters(catFile?.provider?.kind),
    [catFile?.provider?.kind],
  );

  useEffect(() => {
    if (availableQueueFilters.includes(queueFilter)) {
      return;
    }

    setQueueFilter("all");
  }, [availableQueueFilters, queueFilter, setQueueFilter]);

  const { saveTranslation, postComment, resolveComment } = useCatMutations({
    organizationSlug,
    projectId,
    sourcePath,
    targetLocale,
    repositoryFullName,
    catFile,
    invalidateQueue,
  });

  const workspaceState = useMemo(() => {
    if (!catFile) {
      return null;
    }

    return projectFileCatToWorkspaceState(catFile, intl);
  }, [catFile, intl]);

  useEffect(() => {
    if (!workspaceState) {
      return;
    }

    setActiveSegmentId((current) => {
      if (current && workspaceState.segments.some((segment) => segment.id === current)) {
        return current;
      }

      if (initialSegmentKey) {
        const matched = workspaceState.segments.find(
          (segment) => segment.id === initialSegmentKey || segment.key === initialSegmentKey,
        );
        if (matched) {
          return matched.id;
        }
      }

      return workspaceState.segments[0]?.id ?? null;
    });
  }, [initialSegmentKey, workspaceState]);

  const resolvedExternalResourceId =
    externalResourceId ?? catFile?.provider?.externalResourceId ?? null;
  const resolvedResourceType = resourceType ?? catFile?.provider?.resourceType;

  const segmentTargetQuery = useCatSegmentTarget({
    organizationSlug,
    projectId,
    sourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale,
    externalStringId: activeSegmentId,
    repositoryFullName,
    enabled: Boolean(catFile),
  });

  const segmentCommentsQuery = useCatSegmentComments({
    organizationSlug,
    projectId,
    sourcePath,
    externalResourceId: resolvedExternalResourceId,
    resourceType: resolvedResourceType,
    targetLocale,
    externalStringId: activeSegmentId,
    enabled: Boolean(catFile),
  });

  const isCommentsLoading =
    Boolean(activeSegmentId) && segmentCommentsQuery.isFetching && !segmentCommentsQuery.data;

  const isSegmentTargetLoading =
    Boolean(activeSegmentId) && segmentTargetQuery.isFetching && !segmentTargetQuery.data;

  const enrichedWorkspaceState = useMemo(() => {
    if (!workspaceState) {
      return null;
    }

    let nextState = workspaceState;

    if (catFile && activeSegmentId && segmentTargetQuery.data !== undefined) {
      nextState = applyCatSegmentTargetToWorkspaceState(
        nextState,
        catFile,
        activeSegmentId,
        segmentTargetQuery.data,
        intl,
      );
    }

    if (activeSegmentId && segmentCommentsQuery.data) {
      nextState = applyCatSegmentCommentsToWorkspaceState(
        nextState,
        activeSegmentId,
        segmentCommentsQuery.data,
      );
    }

    return nextState;
  }, [
    activeSegmentId,
    catFile,
    intl,
    segmentCommentsQuery.data,
    segmentTargetQuery.data,
    workspaceState,
  ]);

  const validateFormat = useCallback(
    (segment: CatSegment, value: string, glossaryTerms: CatGlossaryTerm[] = []) =>
      validateSegmentFormat(segment, value, intl, glossaryTerms),
    [intl],
  );

  const isNativeProject = !catFile?.provider;

  const handleApprove = useCallback(
    async (segmentId: string, targetText: string) => {
      if (!catFile?.canEditTranslations) {
        throw new Error("Your role cannot write translations back.");
      }

      const translation = await saveTranslation({
        externalStringId: segmentId,
        text: targetText,
        approve: isNativeProject ? true : undefined,
      });
      return translation.isApproved ? "reviewed" : "needs_review";
    },
    [catFile?.canEditTranslations, isNativeProject, saveTranslation],
  );

  const handleSaveDraft = useCallback(
    async (segmentId: string, targetText: string) => {
      if (!catFile?.canEditTranslations) {
        throw new Error("Your role cannot write translations back.");
      }

      await saveTranslation({
        externalStringId: segmentId,
        text: targetText,
        approve: false,
      });
      return "needs_review" as const;
    },
    [catFile?.canEditTranslations, saveTranslation],
  );

  const handleAddComment = useCallback(
    async (segmentId: string, input: CatSegmentCommentInput) => {
      if (!catFile?.canEditTranslations) {
        throw new Error("Your role cannot post comments to the provider.");
      }

      await postComment({
        externalStringId: segmentId,
        text: input.text,
        type: input.type,
        issueType: input.issueType,
      });
    },
    [catFile?.canEditTranslations, postComment],
  );

  const handleResolveComment = useCallback(
    async (segmentId: string, commentId: string) => {
      if (!catFile?.canEditTranslations) {
        throw new Error("Your role cannot resolve issues in the provider.");
      }

      await resolveComment({ externalStringId: segmentId, externalCommentId: commentId });
    },
    [catFile?.canEditTranslations, resolveComment],
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
    async (
      segment: CatSegment,
      options?: { cachedOnly?: boolean; forceRefresh?: boolean },
    ): Promise<string | null> => {
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
          ...(options?.cachedOnly ? { cachedOnly: true } : {}),
          ...(options?.forceRefresh ? { forceRefresh: true } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to look up repository context"));
      }

      const body = (await response.json()) as { stringContext: { summary: string | null } };
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

  const isQueueLoading = isSearchPending || (catQuery.isLoading && !catFile);

  if (catQuery.isLoading && !catFile) {
    return (
      <CatWorkspaceSkeleton
        className={cn(
          "min-h-0 flex-1",
          isFullscreen && "rounded-lg border border-border",
          className,
        )}
      />
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

  const workspaceForRender = enrichedWorkspaceState ?? workspaceState;
  if (!workspaceForRender) {
    return null;
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
        key={`${sourcePath}:${externalResourceId ?? "source-path"}:${targetLocale}:${repositoryFullName ?? "default"}:${debouncedSearch}:${queueFilter}`}
        initialState={workspaceForRender}
        className={cn("min-h-0 flex-1", isFullscreen && "rounded-lg border border-border")}
        navigation={{
          onSelectSegment: (segmentId) => {
            setActiveSegmentId(segmentId);
          },
        }}
        services={{
          validateFormat,
          lookupSegmentConcordance,
          lookupSegmentVisualContext:
            catFile?.provider?.kind && catFile.provider.kind !== "native"
              ? lookupSegmentVisualContext
              : undefined,
          generateAiRecommendation,
          ...(repositoryFullName ? { lookupSegmentContext } : {}),
        }}
        review={{
          onApprove: handleApprove,
          onSaveDraft: isNativeProject ? handleSaveDraft : undefined,
          onAddComment: handleAddComment,
          onResolveComment:
            catFile?.provider?.kind === "crowdin" ? handleResolveComment : undefined,
        }}
        initialSegmentKeyOrId={initialSegmentKey}
        buildSegmentShareUrl={buildSegmentShareUrl}
        queueSearch={search}
        onQueueSearchChange={setSearch}
        queueFilter={queueFilter}
        onQueueFilterChange={setQueueFilter}
        availableQueueFilters={availableQueueFilters}
        isQueueSearchPending={isSearchPending}
        isQueueFetchingPage={isFetchingNextPage}
        isQueueLoading={isQueueLoading}
        isCommentsLoading={isCommentsLoading}
        isSegmentTargetLoading={isSegmentTargetLoading}
        queuePagination={pagination}
        onLoadMoreQueue={loadNextPage}
        hasMoreQueue={pagination?.hasMore ?? false}
      />
    </div>
  );
}
