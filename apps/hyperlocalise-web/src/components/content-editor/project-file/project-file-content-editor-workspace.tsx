"use client";

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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

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
import { mapCatConcordanceForAiRecommendation } from "@/lib/translation/content-editor-recommendation-mapper";
import { AiFeaturesUpgradeHrefProvider } from "@/lib/billing/ai-features-upgrade-href";
import { buildAvailablePlansHref } from "@/lib/billing/plan-usage";
import { useAiFeaturesAccess } from "@/lib/billing/use-ai-features-access";
import { cn } from "@/lib/primitives/cn";

import {
  resolveAvailableCatQueueFilters,
  resolveAvailableCatQueueSorts,
  isServerQueueFilter,
  type ContentEditorQueueFilter,
  type ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import { glossaryFormatChecksForSegment } from "@/components/content-editor/intelligence/content-editor-glossary-checks";
import { buildCatSegmentShareUrl } from "@/components/content-editor/segment/content-editor-segment-share-link";
import type {
  ContentEditorGlossaryTerm,
  ContentEditorSegment,
  ContentEditorSegmentCommentInput,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";
import { ContentEditorWorkspaceContainer } from "@/components/content-editor/workspace/content-editor-workspace-container";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuard,
  type ContentEditorPageNavigationGuardRef,
} from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import { ContentEditorWorkspaceSkeleton } from "@/components/content-editor/workspace/content-editor-workspace-skeleton";
import {
  contentEditorPageLimitForViewMode,
  readCatWorkspaceViewMode,
} from "@/components/content-editor/workspace/content-editor-workspace-view-mode";

import {
  isFileBackedCatSegment,
  resolveCatLinkedIssueTranslationKeyId,
} from "@/components/content-editor/issues/content-editor-linked-issue-translation-key";
import {
  ContentEditorLinkedIssuesDialog,
  type ContentEditorLinkedIssueSegmentContext,
} from "@/components/content-editor/issues/content-editor-linked-issues-dialog";

import { projectFileCatToWorkspaceState } from "./project-file-content-editor-mapper";
import { projectFileCatWorkspaceMessages } from "./project-file-content-editor-workspace.messages";
import { fetchCatSegmentValidation } from "./project-file-content-editor-validation";
import { useContentEditorMutations } from "./use-content-editor-mutations";
import { useContentEditorSegmentQuery } from "./use-content-editor-segment-query";
import { useContentEditorWorkspaceQuerySync } from "./use-content-editor-workspace-query-sync";
import { downloadProjectFileContentEditorExport } from "./project-file-content-editor-export";
import type { ContentEditorFilteredExportFormat } from "@/lib/projects/content-editor/content-editor-filtered-export";

function initialTargetLocale(targetLocales: string[], highlightLocale: string | null) {
  if (highlightLocale && targetLocales.includes(highlightLocale)) {
    return highlightLocale;
  }

  return targetLocales[0] ?? "";
}

function toServerQueueFilterForExport(filter: ContentEditorQueueFilter) {
  return isServerQueueFilter(filter) ? filter : "all";
}

export function ProjectFileContentEditorWorkspace({
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
  initialQueueSort = "file_order",
  initialSearch = "",
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
  initialQueueFilter?: ContentEditorQueueFilter;
  initialQueueSort?: ContentEditorQueueSort;
  initialSearch?: string;
  sourcePathsFilter?: string | null;
  layout?: "default" | "fullscreen";
  className?: string;
  pageNavigationGuardRef?: ContentEditorPageNavigationGuardRef;
}) {
  const intl = useIntl();
  const aiFeaturesAccess = useAiFeaturesAccess();
  const aiFeaturesAllowed = aiFeaturesAccess.status === "allowed";
  const upgradePlanHref =
    aiFeaturesAccess.status === "denied"
      ? { organizationSlug, href: buildAvailablePlansHref(organizationSlug) }
      : null;
  const [linkedIssuesOpen, setLinkedIssuesOpen] = useState(false);
  const [linkedIssuesSegment, setLinkedIssuesSegment] =
    useState<ContentEditorLinkedIssueSegmentContext | null>(null);
  const internalPageNavigationGuardRef = useRef<ContentEditorPageNavigationGuard | null>(null);
  const resolvedPageNavigationGuardRef = pageNavigationGuardRef ?? internalPageNavigationGuardRef;
  const [pageLimit, setPageLimit] = useState(() =>
    contentEditorPageLimitForViewMode(readCatWorkspaceViewMode()),
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
    contentEditorQuery,
    contentEditorFile,
    search,
    setSearch,
    queueFilter,
    setQueueFilter,
    queueSort,
    setQueueSort,
    debouncedSearch,
    isSearchPending,
    pagination,
    loadNextPage,
    invalidateQueue,
    isFetchingNextPage,
  } = useContentEditorSegmentQuery({
    organizationSlug,
    projectId,
    sourcePath,
    externalResourceId,
    resourceType,
    targetLocale,
    enabled: Boolean(targetLocale),
    initialQueueFilter,
    initialQueueSort,
    initialSearch,
    pageLimit,
    sourcePaths: sourcePathsFilter,
  });

  useContentEditorWorkspaceQuerySync({
    queueFilter,
    queueSort,
    search,
    debouncedSearch,
  });

  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadFilteredView = useCallback(
    async (format: ContentEditorFilteredExportFormat) => {
      if (!targetLocale || isExporting) {
        return;
      }

      setIsExporting(true);
      try {
        await downloadProjectFileContentEditorExport({
          organizationSlug,
          projectId,
          sourcePath,
          targetLocale,
          sourceLocale,
          format,
          search: debouncedSearch,
          queueFilter: toServerQueueFilterForExport(queueFilter),
          queueSort,
          externalResourceId,
          resourceType,
          sourcePaths: sourcePathsFilter,
          intl,
        });
      } catch (error) {
        // Surface via console; queue UI already has empty/error states for load failures.
        console.error(error);
      } finally {
        setIsExporting(false);
      }
    },
    [
      debouncedSearch,
      externalResourceId,
      intl,
      isExporting,
      organizationSlug,
      projectId,
      queueFilter,
      queueSort,
      resourceType,
      sourceLocale,
      sourcePath,
      sourcePathsFilter,
      targetLocale,
    ],
  );
  const availableQueueFilters = useMemo(
    () => resolveAvailableCatQueueFilters(contentEditorFile?.provider?.kind),
    [contentEditorFile?.provider?.kind],
  );
  const availableQueueSorts = useMemo(
    () => resolveAvailableCatQueueSorts(contentEditorFile?.provider?.kind),
    [contentEditorFile?.provider?.kind],
  );

  useEffect(() => {
    if (!contentEditorFile) {
      return;
    }

    if (availableQueueFilters.includes(queueFilter)) {
      return;
    }

    setQueueFilter("all");
  }, [availableQueueFilters, contentEditorFile, queueFilter, setQueueFilter]);

  useEffect(() => {
    if (!contentEditorFile) {
      return;
    }

    if (availableQueueSorts.includes(queueSort)) {
      return;
    }

    setQueueSort("file_order");
  }, [availableQueueSorts, contentEditorFile, queueSort, setQueueSort]);

  const {
    saveTranslation,
    postComment,
    resolveComment,
    regenerateImage,
    uploadImage,
    treatAsImage,
    treatAsVideo,
    setStringsHidden,
    setStringsLocked,
    setMaxLength,
    isSavingMaxLength,
    isImageBusy,
  } = useContentEditorMutations({
    organizationSlug,
    projectId,
    sourcePath,
    targetLocale,
    contentEditorFile,
    invalidateQueue,
  });

  const workspaceState = useMemo(() => {
    if (!contentEditorFile) {
      return null;
    }

    return projectFileCatToWorkspaceState(contentEditorFile, sourceLocale, intl);
  }, [contentEditorFile, intl, sourceLocale]);

  const validateFormat = useCallback(
    async (
      segment: ContentEditorSegment,
      value: string,
      glossaryTerms: ContentEditorGlossaryTerm[] = [],
      options?: { signal?: AbortSignal },
    ) => {
      const validation = await fetchCatSegmentValidation({
        sourceText: segment.sourceText,
        targetText: value,
        sourcePath,
        targetLocale: segment.targetLocale,
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

  const isNativeProject = !contentEditorFile?.provider;
  const canHideNativeStrings =
    isNativeProject &&
    Boolean(
      contentEditorFile?.segments.some((segment) => !isFileBackedCatSegment(segment.contentKind)),
    );

  const handleApprove = useCallback(
    async (segmentId: string, targetText: string) => {
      if (!contentEditorFile?.canEditTranslations) {
        throw new Error(
          intl.formatMessage(projectFileCatWorkspaceMessages.cannotWriteTranslations),
        );
      }

      const segment = contentEditorFile.segments.find(
        (entry) => entry.externalStringId === segmentId,
      );
      if (
        segment?.contentKind === "image_file" ||
        segment?.contentKind === "video_file" ||
        segment?.contentKind === "office_file" ||
        segment?.contentKind === "document"
      ) {
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
        if (response.status !== 200) {
          throw new Error(
            await readApiError(
              response,
              intl.formatMessage(
                segment?.contentKind === "video_file"
                  ? projectFileCatWorkspaceMessages.failedToApproveVideo
                  : projectFileCatWorkspaceMessages.failedToApproveImage,
              ),
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
      contentEditorFile?.canEditTranslations,
      contentEditorFile?.segments,
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
      if (!contentEditorFile?.canEditTranslations) {
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
    [contentEditorFile?.canEditTranslations, intl, saveTranslation],
  );

  const handleAddComment = useCallback(
    async (segmentId: string, input: ContentEditorSegmentCommentInput) => {
      if (!contentEditorFile?.canEditTranslations) {
        throw new Error(intl.formatMessage(projectFileCatWorkspaceMessages.cannotPostComments));
      }

      await postComment({
        externalStringId: segmentId,
        text: input.text,
        type: input.type,
        issueType: input.issueType,
      });
    },
    [contentEditorFile?.canEditTranslations, intl, postComment],
  );

  const handleResolveComment = useCallback(
    async (segmentId: string, commentId: string) => {
      if (!contentEditorFile?.canEditTranslations) {
        throw new Error(intl.formatMessage(projectFileCatWorkspaceMessages.cannotResolveIssues));
      }

      await resolveComment({ externalStringId: segmentId, externalCommentId: commentId });
    },
    [contentEditorFile?.canEditTranslations, intl, resolveComment],
  );

  const handleSetStringsHidden = useCallback(
    async (segmentIds: string[], isHidden: boolean) => {
      if (!contentEditorFile?.canEditTranslations) {
        throw new Error(
          intl.formatMessage(projectFileCatWorkspaceMessages.cannotWriteTranslations),
        );
      }

      const externalStringIds = isNativeProject
        ? segmentIds.filter((segmentId) => {
            const segment = contentEditorFile.segments.find(
              (item) => item.externalStringId === segmentId,
            );
            return (
              resolveCatLinkedIssueTranslationKeyId({
                isNativeProject: true,
                segmentId,
                contentKind: segment?.contentKind,
              }) != null
            );
          })
        : segmentIds;
      if (externalStringIds.length === 0) {
        return;
      }

      await setStringsHidden({
        externalStringIds,
        isHidden,
      });
    },
    [
      contentEditorFile?.canEditTranslations,
      contentEditorFile?.segments,
      intl,
      isNativeProject,
      setStringsHidden,
    ],
  );

  const handleSetStringsLocked = useCallback(
    async (segmentIds: string[], isLocked: boolean) => {
      if (!contentEditorFile?.canEditTranslations) {
        throw new Error(
          intl.formatMessage(projectFileCatWorkspaceMessages.cannotWriteTranslations),
        );
      }

      if (segmentIds.length === 0) {
        return;
      }

      await setStringsLocked({
        externalStringIds: segmentIds,
        isLocked,
      });
    },
    [contentEditorFile?.canEditTranslations, intl, setStringsLocked],
  );

  const handleSetMaxLength = useCallback(
    async (segmentId: string, maxLength: number | null) => {
      if (!contentEditorFile?.canEditTranslations || !isNativeProject) {
        throw new Error(
          intl.formatMessage(projectFileCatWorkspaceMessages.cannotWriteTranslations),
        );
      }

      await setMaxLength({
        externalStringId: segmentId,
        maxLength,
      });
    },
    [contentEditorFile?.canEditTranslations, intl, isNativeProject, setMaxLength],
  );

  const handleAddToIssueSheet = useCallback(
    async (segmentId: string) => {
      const segment = contentEditorFile?.segments.find(
        (item) => item.externalStringId === segmentId,
      );
      if (!segment) {
        throw new Error(intl.formatMessage(projectFileCatWorkspaceMessages.segmentNotFound));
      }

      const translationKeyId = resolveCatLinkedIssueTranslationKeyId({
        isNativeProject,
        segmentId,
        contentKind: segment.contentKind,
      });
      setLinkedIssuesSegment({
        segmentId,
        segmentKey: segment.key,
        sourceText: segment.sourceText,
        translationKeyId,
        targetLocale,
        sourcePath,
      });
      setLinkedIssuesOpen(true);
    },
    [contentEditorFile?.segments, intl, isNativeProject, sourcePath, targetLocale],
  );

  const buildSegmentShareUrl = useCallback((segment: ContentEditorSegment) => {
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
      segment: ContentEditorSegment,
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

      if (response.status !== 200) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(projectFileCatWorkspaceMessages.failedToLookUpContext),
          ),
        );
      }

      const body = await response.json();
      return body.stringContext.summary;
    },
    [intl, organizationSlug, projectId, repositoryFullName, sourcePath],
  );

  const lookupSegmentConcordance = useCallback(
    async (segment: ContentEditorSegment) => {
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

      if (response.status !== 200) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(projectFileCatWorkspaceMessages.failedToSearchConcordance),
          ),
        );
      }

      const body = await response.json();
      return body.concordance;
    },
    [intl, organizationSlug, projectId],
  );

  const lookupSegmentVisualContext = useCallback(
    async (segment: ContentEditorSegment) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat["visual-context"].$post({
        param: { organizationSlug, projectId },
        json: {
          sourcePath,
          externalStringId: segment.id,
        },
      });

      if (response.status !== 200) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(projectFileCatWorkspaceMessages.failedToLoadVisualContext),
          ),
        );
      }

      const body = await response.json();
      return body.visualContext;
    },
    [intl, organizationSlug, projectId, sourcePath],
  );

  const generateAiRecommendation = useCallback(
    async (
      segment: ContentEditorSegment,
      targetText: string,
      intelligence?: ContentEditorSegmentIntelligence,
    ) => {
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

      if (response.status !== 200) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(projectFileCatWorkspaceMessages.failedToGenerateRecommendation),
          ),
        );
      }

      const body = await response.json();
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

  const isQueueLoading =
    isSearchPending ||
    (contentEditorQuery.isLoading && !contentEditorFile) ||
    contentEditorQuery.isPlaceholderData;

  if (contentEditorQuery.isLoading && !contentEditorFile) {
    return (
      <ContentEditorWorkspaceSkeleton
        className={cn(
          "min-h-0 flex-1",
          isFullscreen && "rounded-lg border border-border",
          className,
        )}
      />
    );
  }

  if (contentEditorQuery.isError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-flame-100">
        <HugeiconsIcon icon={AlertCircleIcon} className="size-4" />
        <TypographyP className="text-sm">
          {contentEditorQuery.error instanceof Error
            ? contentEditorQuery.error.message
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

      <AiFeaturesUpgradeHrefProvider value={upgradePlanHref}>
        <ContentEditorWorkspaceContainer
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
            contentEditorFile,
            enabled: Boolean(contentEditorFile),
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
                  onTreatAsVideo: async (segmentId: string, nextTreatAsVideo: boolean) => {
                    await treatAsVideo({
                      externalStringId: segmentId,
                      treatAsVideo: nextTreatAsVideo,
                    });
                  },
                  ...(aiFeaturesAllowed
                    ? {
                        onRegenerateImage: async (segmentId, options) => {
                          await regenerateImage({
                            externalStringId: segmentId,
                            instructions: options?.instructions,
                            force: options?.force,
                          });
                        },
                      }
                    : {}),
                  onSetMaxLength: handleSetMaxLength,
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
              contentEditorFile?.provider?.kind && contentEditorFile.provider.kind !== "native"
                ? lookupSegmentVisualContext
                : undefined,
            generateAiRecommendation:
              aiFeaturesAccess.status === "allowed" ? generateAiRecommendation : undefined,
          }}
          review={{
            onApprove: handleApprove,
            onSaveDraft: isNativeProject ? handleSaveDraft : undefined,
            onAddComment: handleAddComment,
            onAddToIssueSheet: handleAddToIssueSheet,
            onResolveComment:
              contentEditorFile?.provider?.kind === "crowdin" ? handleResolveComment : undefined,
            ...(canHideNativeStrings || contentEditorFile?.provider?.kind === "crowdin"
              ? {
                  onBulkHide: (segmentIds: string[]) => handleSetStringsHidden(segmentIds, true),
                  onBulkUnhide: (segmentIds: string[]) => handleSetStringsHidden(segmentIds, false),
                }
              : {}),
            onSetLocked: handleSetStringsLocked,
            onBulkLock: (segmentIds: string[]) => handleSetStringsLocked(segmentIds, true),
            onBulkUnlock: (segmentIds: string[]) => handleSetStringsLocked(segmentIds, false),
          }}
          initialSegmentKeyOrId={initialSegmentKey}
          buildSegmentShareUrl={buildSegmentShareUrl}
          queueSearch={search}
          onQueueSearchChange={setSearch}
          queueFilter={queueFilter}
          onQueueFilterChange={setQueueFilter}
          availableQueueFilters={availableQueueFilters}
          queueSort={queueSort}
          onQueueSortChange={setQueueSort}
          availableQueueSorts={availableQueueSorts}
          isQueueSearchPending={isSearchPending}
          isQueueFetchingPage={isFetchingNextPage}
          isQueueLoading={isQueueLoading}
          isImageBusy={isImageBusy}
          isMaxLengthSaving={isSavingMaxLength}
          queuePagination={pagination}
          onLoadMoreQueue={loadNextPage}
          hasMoreQueue={pagination?.hasMore ?? false}
          canLookupFreshContext={aiFeaturesAllowed && canLookupFreshContext}
          onPageLimitChange={setPageLimit}
          nativeIssuesEnabled={isNativeProject}
          onDownloadFilteredView={handleDownloadFilteredView}
          isDownloadingFilteredView={isExporting}
        />
      </AiFeaturesUpgradeHrefProvider>
      <ContentEditorLinkedIssuesDialog
        open={linkedIssuesOpen}
        onOpenChange={setLinkedIssuesOpen}
        organizationSlug={organizationSlug}
        projectId={projectId}
        segment={linkedIssuesSegment}
      />
    </div>
  );
}
