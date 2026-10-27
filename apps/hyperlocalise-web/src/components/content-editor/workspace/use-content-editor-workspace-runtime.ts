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
import { useCallback, useEffect, useMemo } from "react";
import { computed } from "mobx";
import { useIntl } from "react-intl";

import type { ContentEditorQueueFilter } from "@/components/content-editor/queue/content-editor-queue-filter";
import { buildCatSegmentShareUrl } from "@/components/content-editor/segment/content-editor-segment-share-link";
import type {
  ContentEditorWorkspaceDependencies,
  ContentEditorWorkspaceEditing,
  ContentEditorWorkspaceNavigation,
  ContentEditorWorkspaceReview,
  ContentEditorWorkspaceServices,
  PartialCatWorkspaceDependencies,
} from "@/components/content-editor/shared/dependencies";
import type {
  ContentEditorSegment,
  ContentEditorTranslationMemoryMatch,
} from "@/components/content-editor/shared/types";

import type { ContentEditorWorkspaceOrchestrator } from "./content-editor-workspace-orchestrator";
import {
  ContentEditorIntelligenceController,
  type ContentEditorIntelligenceControllerPorts,
} from "./controllers/content-editor-intelligence-controller";
import {
  ContentEditorNavigationController,
  type ContentEditorNavigationControllerPorts,
} from "./controllers/content-editor-navigation-controller";
import {
  ContentEditorReviewController,
  type ContentEditorReviewControllerPorts,
} from "./controllers/content-editor-review-controller";
import {
  getAiSuggestionForSegment,
  glossaryTermsForSegment,
} from "./store/content-editor-workspace-store-utils";

export interface UseCatWorkspaceRuntimeInput {
  store: ContentEditorWorkspaceOrchestrator;
  dependencies?: PartialCatWorkspaceDependencies;
  navigation?: Partial<ContentEditorWorkspaceNavigation>;
  editing?: Partial<ContentEditorWorkspaceEditing>;
  review?: Partial<ContentEditorWorkspaceReview>;
  services?: ContentEditorWorkspaceServices;
  queueFilter?: ContentEditorQueueFilter;
  onQueueFilterChange?: (filter: ContentEditorQueueFilter) => void;
  buildSegmentShareUrl?: (segment: ContentEditorSegment) => string | null;
  canLookupFreshContext?: boolean;
  /** When true, Next at the loaded-page boundary should fetch more queue rows. */
  hasMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
}

export function useContentEditorWorkspaceRuntime({
  store,
  dependencies: dependencyOverrides,
  navigation: navigationOverrides = dependencyOverrides?.navigation,
  editing: editingOverrides = dependencyOverrides?.editing,
  review: reviewOverrides = dependencyOverrides?.review,
  services: serviceOverrides = dependencyOverrides?.services,
  queueFilter: queueFilterProp,
  onQueueFilterChange,
  buildSegmentShareUrl,
  canLookupFreshContext = true,
  hasMoreQueue = false,
  onLoadMoreQueue,
}: UseCatWorkspaceRuntimeInput) {
  const intl = useIntl();
  const queueFilter = queueFilterProp ?? store.queueFilter;
  const usesServerQueueFilter = Boolean(onQueueFilterChange);

  const validateFormat = serviceOverrides?.validateFormat;
  const runQaChecks = serviceOverrides?.runQaChecks;
  const lookupSegmentContext = serviceOverrides?.lookupSegmentContext;
  const lookupSegmentVisualContext = serviceOverrides?.lookupSegmentVisualContext;
  const generateAiRecommendation = serviceOverrides?.generateAiRecommendation;

  const onSelectSegment = navigationOverrides?.onSelectSegment;
  const onPreviousSegment = navigationOverrides?.onPreviousSegment;
  const onNextSegment = navigationOverrides?.onNextSegment;
  const onReviewInSequence = navigationOverrides?.onReviewInSequence;
  const onTargetChange = editingOverrides?.onTargetChange;
  const onUseAiSuggestion = editingOverrides?.onUseAiSuggestion;
  const onSaveDraft = reviewOverrides?.onSaveDraft;
  const onAskQuestion = reviewOverrides?.onAskQuestion;

  const canLookupContext = Boolean(lookupSegmentContext) && canLookupFreshContext;
  const canLoadVisualContext = Boolean(lookupSegmentVisualContext);
  const canUseAiRecommendation = Boolean(generateAiRecommendation);
  const queueView = useMemo(
    () => computed(() => store.getQueuePanelSegments(queueFilter, usesServerQueueFilter)),
    [store, queueFilter, usesServerQueueFilter],
  );
  const queuePanelSegments = queueView.get();

  const intelligencePorts = useMemo<ContentEditorIntelligenceControllerPorts>(
    () => ({
      intl,
      services: serviceOverrides,
    }),
    [intl, serviceOverrides],
  );
  const intelligenceController = useMemo(
    () => new ContentEditorIntelligenceController(store, intelligencePorts),
    [store],
  );

  const reviewPorts = useMemo<ContentEditorReviewControllerPorts>(
    () => ({
      intl,
      services: serviceOverrides,
      review: reviewOverrides,
      loadConcordance: (segmentId) => intelligenceController.loadConcordance(segmentId),
      queueFilter,
      usesServerQueueFilter,
    }),
    [
      intelligenceController,
      intl,
      queueFilter,
      reviewOverrides,
      serviceOverrides,
      usesServerQueueFilter,
    ],
  );
  const reviewController = useMemo(
    () => new ContentEditorReviewController(store, reviewPorts),
    [store],
  );

  const navigationPorts = useMemo<ContentEditorNavigationControllerPorts>(
    () => ({
      queueFilter,
      usesServerQueueFilter,
      hasMoreQueue,
      onLoadMoreQueue,
      navigation: { onSelectSegment, onPreviousSegment, onNextSegment },
    }),
    [
      hasMoreQueue,
      onLoadMoreQueue,
      onNextSegment,
      onPreviousSegment,
      onSelectSegment,
      queueFilter,
      usesServerQueueFilter,
    ],
  );
  const navigationController = useMemo(
    () => new ContentEditorNavigationController(store, navigationPorts),
    [store],
  );

  useEffect(() => {
    intelligenceController.configure(intelligencePorts);
    reviewController.configure(reviewPorts);
    navigationController.configure(navigationPorts);
  }, [
    intelligenceController,
    intelligencePorts,
    navigationController,
    navigationPorts,
    reviewController,
    reviewPorts,
  ]);

  useEffect(() => {
    store.groupVariants.setServices({
      validateFormat,
      glossaryTerms: (segmentId) => glossaryTermsForSegment(store.shellState, segmentId),
    });
  }, [store, validateFormat]);

  useEffect(() => {
    store.attachControllers(intelligenceController, reviewController, navigationController);
    store.start();
    return () => store.dispose();
  }, [intelligenceController, navigationController, reviewController, store]);

  const handleIntelligencePanelVisible = useCallback(
    (segmentId: string) => intelligenceController.panelVisible(segmentId),
    [intelligenceController],
  );

  const handleLoadSegmentConcordance = useCallback(
    (segmentId: string) => intelligenceController.ensureConcordance(segmentId),
    [intelligenceController],
  );

  const dependencies = useMemo<ContentEditorWorkspaceDependencies>(() => {
    const sendTextToGroupVariant = (segmentId: string, text: string) => {
      const locale = store.getSegmentView(segmentId)?.targetLocale;
      return Boolean(locale && store.groupVariants.routeText(segmentId, locale, text));
    };
    const editing: ContentEditorWorkspaceEditing = {
      onTargetChange: (segmentId: string, value: string) => {
        store.setTargetText(segmentId, value);
        const segmentToValidate = store.getSegmentView(segmentId);
        if (segmentToValidate) {
          reviewController.scheduleChecks(segmentToValidate, value);
        }
        onTargetChange?.(segmentId, value);
      },
      onUseAiSuggestion: (segmentId: string) => {
        const aiSuggestion = getAiSuggestionForSegment(store.shellState, segmentId);
        if (!aiSuggestion) {
          return;
        }
        if (!sendTextToGroupVariant(segmentId, aiSuggestion)) {
          editing.onTargetChange(segmentId, aiSuggestion);
        }
        onUseAiSuggestion?.(segmentId);
      },
      onUseTmMatch: (segmentId: string, match: ContentEditorTranslationMemoryMatch) => {
        if (sendTextToGroupVariant(segmentId, match.targetText)) return;
        editing.onTargetChange(segmentId, match.targetText);
      },
      ...(editingOverrides?.onTreatAsImage
        ? { onTreatAsImage: editingOverrides.onTreatAsImage }
        : {}),
      ...(editingOverrides?.onTreatAsVideo
        ? { onTreatAsVideo: editingOverrides.onTreatAsVideo }
        : {}),
      ...(editingOverrides?.onRegenerateImage
        ? { onRegenerateImage: editingOverrides.onRegenerateImage }
        : {}),
      ...(editingOverrides?.onUploadImage ? { onUploadImage: editingOverrides.onUploadImage } : {}),
      ...(editingOverrides?.onUploadVisualContext
        ? {
            onUploadVisualContext: async (segmentId: string, file: File) => {
              const visualContext = await editingOverrides.onUploadVisualContext?.(segmentId, file);
              if (visualContext) {
                store.mergeSegmentIntelligence(segmentId, { visualContext });
              }
              return visualContext;
            },
          }
        : {}),
      ...(editingOverrides?.onSetMaxLength
        ? { onSetMaxLength: editingOverrides.onSetMaxLength }
        : {}),
    };

    const navigation: ContentEditorWorkspaceNavigation = {
      onSelectSegment: navigationController.selectSegment.bind(navigationController),
      onPreviousSegment: navigationController.previous.bind(navigationController),
      onNextSegment: navigationController.next.bind(navigationController),
      onPreviousUntranslatedSegment:
        navigationController.previousUntranslated.bind(navigationController),
      onNextUntranslatedSegment: navigationController.nextUntranslated.bind(navigationController),
      onReviewInSequence: () => {
        onReviewInSequence?.();
      },
    };

    const review: ContentEditorWorkspaceReview = {
      onApprove: (segmentId, targetText) => reviewController.approve(segmentId, targetText),
      ...(onSaveDraft
        ? {
            onSaveDraft: (segmentId: string, targetText: string) =>
              reviewController.saveDraft(segmentId, targetText),
          }
        : {}),
      onAddComment: (segmentId, input) => reviewController.addComment(segmentId, input),
      onResolveComment: (segmentId, commentId) =>
        reviewController.resolveComment(segmentId, commentId),
      onAskQuestion: async (segmentId: string, options?: { forceRefresh?: boolean }) => {
        await onAskQuestion?.(segmentId, options);
        const receivedFreshContext = await intelligenceController.askQuestion(segmentId, options);
        if (receivedFreshContext && generateAiRecommendation) {
          await reviewController.runReview(segmentId, { includeAi: true });
        }
      },
      onReviewWithAi: async (segmentId: string) => {
        await reviewController.runReview(segmentId, { includeAi: true });
      },
      onSkip: reviewController.skip.bind(reviewController),
      ...(reviewOverrides?.onAddToIssueSheet
        ? { onAddToIssueSheet: reviewOverrides.onAddToIssueSheet }
        : {}),
      ...(reviewOverrides?.onSetLocked
        ? {
            onSetLocked: (segmentIds: string[], isLocked: boolean) =>
              reviewController.setLocked(segmentIds, isLocked),
          }
        : {}),
    };

    return {
      navigation,
      editing,
      review,
      services: {
        generateAiRecommendation,
        validateFormat,
        runQaChecks,
      },
    };
  }, [
    editingOverrides?.onRegenerateImage,
    editingOverrides?.onSetMaxLength,
    editingOverrides?.onTreatAsImage,
    editingOverrides?.onTreatAsVideo,
    editingOverrides?.onUploadImage,
    editingOverrides?.onUploadVisualContext,
    generateAiRecommendation,
    intelligenceController,
    navigationController,
    onAskQuestion,
    onReviewInSequence,
    onSaveDraft,
    onTargetChange,
    onUseAiSuggestion,
    runQaChecks,
    reviewController,
    reviewOverrides?.onAddToIssueSheet,
    reviewOverrides?.onSetLocked,
    store,
    validateFormat,
  ]);

  const handleQueueFilterChange = useCallback(
    (filter: ContentEditorQueueFilter) => {
      navigationController.cancelPendingAdvance();
      if (onQueueFilterChange) {
        onQueueFilterChange(filter);
        return;
      }

      store.setQueueFilter(filter);
    },
    [navigationController, onQueueFilterChange, store],
  );

  const handleBulkApprove = useCallback(() => reviewController.bulkApprove(), [reviewController]);
  const handleBulkSkip = useCallback(() => reviewController.bulkSkip(), [reviewController]);
  const handleBulkHide = useCallback(() => reviewController.bulkHide(), [reviewController]);
  const handleBulkUnhide = useCallback(() => reviewController.bulkUnhide(), [reviewController]);
  const handleBulkLock = useCallback(() => reviewController.bulkLock(), [reviewController]);
  const handleBulkUnlock = useCallback(() => reviewController.bulkUnlock(), [reviewController]);
  const handleSetLocked = useCallback(
    (segmentIds: string[], isLocked: boolean) => reviewController.setLocked(segmentIds, isLocked),
    [reviewController],
  );

  const resolvedBuildSegmentShareUrl = useMemo(() => {
    if (buildSegmentShareUrl) {
      return buildSegmentShareUrl;
    }

    if (typeof window === "undefined") {
      return undefined;
    }

    return (segment: ContentEditorSegment) =>
      buildCatSegmentShareUrl({
        baseUrl: window.location.href,
        segmentId: segment.id,
        segmentKey: segment.key,
      });
  }, [buildSegmentShareUrl]);

  return {
    shell: store.shellState,
    queueSegments: queuePanelSegments,
    selectedSegment: store.selectedSegmentView ?? null,
    dependencies,
    dirtySegmentIds: store.dirtySegmentIds,
    queueFilter,
    handleQueueFilterChange,
    handleBulkApprove,
    handleBulkSkip,
    handleBulkHide,
    handleBulkUnhide,
    handleBulkLock,
    handleBulkUnlock,
    handleSetLocked,
    resolvedBuildSegmentShareUrl,
    canLookupContext,
    canLoadVisualContext,
    canUseAiRecommendation,
    handleIntelligencePanelVisible,
    handleLoadSegmentConcordance,
    handleReloadConcordance: (segmentId: string) =>
      intelligenceController.reloadConcordance(segmentId),
  };
}
