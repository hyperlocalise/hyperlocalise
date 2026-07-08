"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircleIcon } from "lucide-react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

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
import { mapCatConcordanceForAiRecommendation } from "@/lib/translation/cat-recommendation-mapper";
import { cn } from "@/lib/primitives/cn";

import {
  resolveAvailableCatQueueFilters,
  type CatQueueFilter,
} from "@/components/cat/queue/cat-queue-filter";
import { glossaryFormatChecksForSegment } from "@/components/cat/intelligence/cat-glossary-checks";
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
  catPageLimitForViewMode,
  readCatWorkspaceViewMode,
  writeCatWorkspaceViewMode,
  type CatWorkspaceViewMode,
} from "@/components/cat/workspace/cat-workspace-view-mode";

import { projectFileCatToWorkspaceState } from "./project-file-cat-mapper";
import { fetchCatSegmentValidation } from "./project-file-cat-validation";
import { useCatMutations } from "./use-cat-mutations";
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
  sourceLocale,
  sourcePath,
  externalResourceId = null,
  resourceType,
  targetLocale: targetLocaleProp,
  targetLocales,
  highlightLocale = null,
  repositoryFullName = null,
  canLookupFreshContext = true,
  initialSegmentKey = null,
  initialQueueFilter = "all",
  layout = "default",
  className,
}: {
  organizationSlug: string;
  projectId: string;
  sourceLocale: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale?: string;
  targetLocales?: string[];
  highlightLocale?: string | null;
  repositoryFullName?: string | null;
  canLookupFreshContext?: boolean;
  initialSegmentKey?: string | null;
  initialQueueFilter?: CatQueueFilter;
  layout?: "default" | "fullscreen";
  className?: string;
}) {
  const intl = useIntl();
  const [viewMode, setViewMode] = useState<CatWorkspaceViewMode>(() => readCatWorkspaceViewMode());
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
    enabled: Boolean(targetLocale),
    initialQueueFilter,
    pageLimit: catPageLimitForViewMode(viewMode),
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
    catFile,
    invalidateQueue,
  });

  const workspaceState = useMemo(() => {
    if (!catFile) {
      return null;
    }

    return projectFileCatToWorkspaceState(catFile, sourceLocale, intl);
  }, [catFile, intl, sourceLocale]);

  const validateFormat = useCallback(
    async (
      segment: CatSegment,
      value: string,
      glossaryTerms: CatGlossaryTerm[] = [],
      options?: { signal?: AbortSignal },
    ) => {
      const validation = await fetchCatSegmentValidation({
        sourceText: segment.sourceText,
        targetText: value,
        sourcePath,
        maxLength: segment.maxLength,
        signal: options?.signal,
      });

      if (!validation.ok) {
        if (validation.error.code === "aborted") {
          const abortError = new Error("Segment validation aborted.");
          abortError.name = "AbortError";
          throw abortError;
        }

        return [
          {
            id: "validation-unavailable",
            label: "Validation unavailable",
            status: "warn" as const,
            message: validation.error.message,
            category: "qa" as const,
          },
          ...glossaryFormatChecksForSegment(segment.sourceText, value, glossaryTerms, intl),
        ];
      }

      return [
        ...validation.value,
        ...glossaryFormatChecksForSegment(segment.sourceText, value, glossaryTerms, intl),
      ];
    },
    [intl, sourcePath],
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

  const handleAddToIssueSheet = useCallback(
    async (segmentId: string) => {
      const segment = catFile?.segments.find((item) => item.externalStringId === segmentId);
      if (!segment) {
        throw new Error("Segment not found.");
      }

      const issueSheetUrl = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/issue-sheet`;
      const linkUrl =
        typeof window === "undefined"
          ? null
          : buildCatSegmentShareUrl({
              baseUrl: window.location.href,
              segmentId,
              segmentKey: segment.key,
            });

      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Context needed: ${segment.key}`,
            description: segment.sourceText,
            issueType: "context_request",
            targetLocale,
            sourcePath,
            segmentId,
            linkKind: "cat_segment",
            linkLabel: "Open in CAT",
            linkUrl: linkUrl ?? undefined,
            externalRef: `cat:${projectId}:${sourcePath}:${targetLocale}:${segmentId}`,
            priority: "P2",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to add to Issue Sheet"));
      }

      toast.success("Added to Issue Sheet", {
        action: {
          label: "View row",
          onClick: () => {
            window.location.href = issueSheetUrl;
          },
        },
      });
    },
    [catFile?.segments, organizationSlug, projectId, sourcePath, targetLocale],
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
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files[
        "string-context"
      ].$post({
        param: { organizationSlug, projectId },
        json: {
          sourcePath,
          ...(repositoryFullName ? { repositoryFullName } : {}),
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

  const workspaceForRender = workspaceState;
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
        key={`${sourcePath}:${externalResourceId ?? "source-path"}:${targetLocale}`}
        initialState={workspaceForRender}
        queueSnapshot={workspaceState}
        lazySegment={{
          organizationSlug,
          projectId,
          sourcePath,
          targetLocale,
          externalResourceId,
          resourceType,
          catFile,
          enabled: Boolean(catFile),
        }}
        className={cn("min-h-0 flex-1", isFullscreen && "rounded-lg border border-border")}
        navigation={{}}
        services={{
          validateFormat,
          lookupSegmentConcordance,
          lookupSegmentContext,
          lookupSegmentVisualContext:
            catFile?.provider?.kind && catFile.provider.kind !== "native"
              ? lookupSegmentVisualContext
              : undefined,
          generateAiRecommendation,
        }}
        review={{
          onApprove: handleApprove,
          onSaveDraft: isNativeProject ? handleSaveDraft : undefined,
          onAddComment: handleAddComment,
          onAddToIssueSheet: handleAddToIssueSheet,
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
        queuePagination={pagination}
        onLoadMoreQueue={loadNextPage}
        hasMoreQueue={pagination?.hasMore ?? false}
        canLookupFreshContext={canLookupFreshContext}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          writeCatWorkspaceViewMode(mode);
        }}
      />
    </div>
  );
}
