"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircleIcon } from "lucide-react";
import { FormattedMessage, useIntl } from "react-intl";
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
import {
  formatLocaleDisplayName,
  formatLocaleOptionLabel,
} from "@/lib/i18n/locale-display-names.messages";
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
import {
  attemptCatPageNavigation,
  type CatPageNavigationGuard,
  type CatPageNavigationGuardRef,
} from "@/components/cat/workspace/cat-page-navigation-guard";
import { CatWorkspaceSkeleton } from "@/components/cat/workspace/cat-workspace-skeleton";
import {
  catPageLimitForViewMode,
  readCatWorkspaceViewMode,
} from "@/components/cat/workspace/cat-workspace-view-mode";

import { useOptionalAppShellStore } from "@/components/app-shell/store/app-shell-store-context";

import { projectFileCatToWorkspaceState } from "./project-file-cat-mapper";
import { projectFileCatWorkspaceMessages } from "./project-file-cat-workspace.messages";
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
  sourcePathsFilter = null,
  layout = "default",
  className,
  pageNavigationGuardRef,
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
  sourcePathsFilter?: string | null;
  layout?: "default" | "fullscreen";
  className?: string;
  pageNavigationGuardRef?: CatPageNavigationGuardRef;
}) {
  const intl = useIntl();
  const appShellStore = useOptionalAppShellStore();
  const issuesEnabled = appShellStore?.workspaceFeatureFlags.issues ?? false;
  const internalPageNavigationGuardRef = useRef<CatPageNavigationGuard | null>(null);
  const resolvedPageNavigationGuardRef = pageNavigationGuardRef ?? internalPageNavigationGuardRef;
  const [pageLimit, setPageLimit] = useState(() =>
    catPageLimitForViewMode(readCatWorkspaceViewMode()),
  );
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
    pageLimit,
    sourcePaths: sourcePathsFilter,
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

  const {
    saveTranslation,
    postComment,
    resolveComment,
    regenerateImage,
    uploadImage,
    treatAsImage,
    isImageBusy,
  } = useCatMutations({
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
        intl,
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
            label: intl.formatMessage(projectFileCatWorkspaceMessages.validationUnavailableLabel),
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
        throw new Error(
          intl.formatMessage(projectFileCatWorkspaceMessages.cannotWriteTranslations),
        );
      }

      const segment = catFile.segments.find((entry) => entry.externalStringId === segmentId);
      if (segment?.contentKind === "image_file") {
        const response = await apiClient.api.orgs[":organizationSlug"].projects[
          ":projectId"
        ].files.detail.cat.images.status.$patch({
          param: { organizationSlug, projectId },
          json: {
            sourcePath,
            targetLocale,
            status: "approved",
          },
        });
        if (!response.ok) {
          throw new Error(
            await readApiError(
              response,
              intl.formatMessage(projectFileCatWorkspaceMessages.failedToApproveImage),
            ),
          );
        }
        return "reviewed" as const;
      }

      const translation = await saveTranslation({
        externalStringId: segmentId,
        text: targetText,
        approve: isNativeProject ? true : undefined,
      });
      return translation.isApproved ? "reviewed" : "needs_review";
    },
    [
      catFile?.canEditTranslations,
      catFile?.segments,
      intl,
      isNativeProject,
      organizationSlug,
      projectId,
      saveTranslation,
      sourcePath,
      targetLocale,
    ],
  );

  const handleSaveDraft = useCallback(
    async (segmentId: string, targetText: string) => {
      if (!catFile?.canEditTranslations) {
        throw new Error(
          intl.formatMessage(projectFileCatWorkspaceMessages.cannotWriteTranslations),
        );
      }

      await saveTranslation({
        externalStringId: segmentId,
        text: targetText,
        approve: false,
      });
      return "needs_review" as const;
    },
    [catFile?.canEditTranslations, intl, saveTranslation],
  );

  const handleAddComment = useCallback(
    async (segmentId: string, input: CatSegmentCommentInput) => {
      if (!catFile?.canEditTranslations) {
        throw new Error(intl.formatMessage(projectFileCatWorkspaceMessages.cannotPostComments));
      }

      await postComment({
        externalStringId: segmentId,
        text: input.text,
        type: input.type,
        issueType: input.issueType,
      });
    },
    [catFile?.canEditTranslations, intl, postComment],
  );

  const handleResolveComment = useCallback(
    async (segmentId: string, commentId: string) => {
      if (!catFile?.canEditTranslations) {
        throw new Error(intl.formatMessage(projectFileCatWorkspaceMessages.cannotResolveIssues));
      }

      await resolveComment({ externalStringId: segmentId, externalCommentId: commentId });
    },
    [catFile?.canEditTranslations, intl, resolveComment],
  );

  const handleAddToIssueSheet = useCallback(
    async (segmentId: string) => {
      const segment = catFile?.segments.find((item) => item.externalStringId === segmentId);
      if (!segment) {
        throw new Error(intl.formatMessage(projectFileCatWorkspaceMessages.segmentNotFound));
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
            title: intl.formatMessage(projectFileCatWorkspaceMessages.contextNeededIssueTitle, {
              key: segment.key,
            }),
            description: segment.sourceText,
            issueType: "context_request",
            targetLocale,
            sourcePath,
            segmentId,
            linkKind: "cat_segment",
            linkLabel: intl.formatMessage(projectFileCatWorkspaceMessages.openInCatLinkLabel),
            linkUrl: linkUrl ?? undefined,
            externalRef: `cat:${projectId}:${sourcePath}:${targetLocale}:${segmentId}`,
            priority: "P2",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(projectFileCatWorkspaceMessages.failedToAddToIssueSheet),
          ),
        );
      }

      toast.success(intl.formatMessage(projectFileCatWorkspaceMessages.addedToIssueSheet), {
        action: {
          label: intl.formatMessage(projectFileCatWorkspaceMessages.viewIssueSheetRow),
          onClick: () => {
            window.location.href = issueSheetUrl;
          },
        },
      });
    },
    [catFile?.segments, intl, organizationSlug, projectId, sourcePath, targetLocale],
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
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(projectFileCatWorkspaceMessages.failedToLookUpContext),
          ),
        );
      }

      const body = (await response.json()) as { stringContext: { summary: string | null } };
      return body.stringContext.summary;
    },
    [intl, organizationSlug, projectId, repositoryFullName, sourcePath],
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
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(projectFileCatWorkspaceMessages.failedToSearchConcordance),
          ),
        );
      }

      const body = (await response.json()) as ProjectFileCatConcordanceResponse;
      return body.concordance;
    },
    [intl, organizationSlug, projectId],
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
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(projectFileCatWorkspaceMessages.failedToLoadVisualContext),
          ),
        );
      }

      const body = (await response.json()) as ProjectFileCatVisualContextResponse;
      return body.visualContext;
    },
    [intl, organizationSlug, projectId, sourcePath],
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

      const recommendationSourcePath =
        segment.sourcePath?.trim() || intelligence?.filePath?.trim() || sourcePath;

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.recommendation.$post({
        param: { organizationSlug, projectId },
        json: {
          sourcePath: recommendationSourcePath,
          targetLocale,
          sourceLocale: segment.sourceLocale,
          displayLocale: intl.locale,
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
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(projectFileCatWorkspaceMessages.failedToGenerateRecommendation),
          ),
        );
      }

      const body = (await response.json()) as ProjectFileCatRecommendationResponse;
      return body.recommendation;
    },
    [intl, organizationSlug, projectId, sourcePath, targetLocale],
  );

  if (showLocaleSelector && (targetLocales?.length ?? 0) === 0) {
    return (
      <TypographyP className="text-sm text-muted-foreground">
        <FormattedMessage {...projectFileCatWorkspaceMessages.noTargetLocales} />
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
            : intl.formatMessage(projectFileCatWorkspaceMessages.failedToLoadWorkspace)}
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
            <FormattedMessage {...projectFileCatWorkspaceMessages.targetLocaleLabel} />
          </TypographyP>
          <Select
            value={targetLocale}
            onValueChange={(value) => {
              if (!value || value === targetLocale) {
                return;
              }

              attemptCatPageNavigation(resolvedPageNavigationGuardRef, () => {
                setTargetLocaleState(value);
              });
            }}
          >
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue
                placeholder={intl.formatMessage(
                  projectFileCatWorkspaceMessages.selectLocalePlaceholder,
                )}
              />
            </SelectTrigger>
            <SelectContent
              align="start"
              alignItemWithTrigger={false}
              className="w-max min-w-[17rem] max-w-[min(22rem,calc(100vw-2rem))]"
            >
              {(targetLocales ?? []).map((locale) => (
                <SelectItem
                  key={locale}
                  value={locale}
                  label={formatLocaleOptionLabel(intl, locale)}
                >
                  <span className="truncate">{formatLocaleDisplayName(intl, locale)}</span>
                  <span className="font-mono text-muted-foreground">
                    <FormattedMessage
                      {...projectFileCatWorkspaceMessages.localeCodeInParens}
                      values={{ locale }}
                    />
                  </span>
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
        pageNavigationGuardRef={resolvedPageNavigationGuardRef}
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
        editing={{
          onTreatAsImage: async (segmentId, nextTreatAsImage) => {
            await treatAsImage({
              externalStringId: segmentId,
              treatAsImage: nextTreatAsImage,
            });
          },
          ...(isNativeProject
            ? {
                onRegenerateImage: async (segmentId: string) => {
                  await regenerateImage({ externalStringId: segmentId });
                },
              }
            : {}),
          onUploadImage: async (segmentId, file) => {
            await uploadImage({ externalStringId: segmentId, file });
          },
        }}
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
          onAddToIssueSheet: issuesEnabled ? handleAddToIssueSheet : undefined,
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
        isImageBusy={isImageBusy}
        queuePagination={pagination}
        onLoadMoreQueue={loadNextPage}
        hasMoreQueue={pagination?.hasMore ?? false}
        canLookupFreshContext={canLookupFreshContext}
        onPageLimitChange={setPageLimit}
      />
    </div>
  );
}
