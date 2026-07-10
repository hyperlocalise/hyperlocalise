"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useIntl } from "react-intl";

import { applyGlossaryTermToTarget } from "@/components/cat/intelligence/cat-glossary-utils";
import { TM_AUTO_FILL_MIN_MATCH_PERCENT_DEFAULT } from "@/components/cat/intelligence/tm-match-quality";
import {
  findSegmentIdByKeyOrIdInQueue,
  type CatQueueFilter,
} from "@/components/cat/queue/cat-queue-filter";
import { buildCatSegmentShareUrl } from "@/components/cat/segment/cat-segment-share-link";
import type {
  CatWorkspaceDependencies,
  CatWorkspaceEditing,
  CatWorkspaceNavigation,
  CatWorkspaceReview,
  CatWorkspaceServices,
  PartialCatWorkspaceDependencies,
} from "@/components/cat/shared/dependencies";
import type {
  CatGlossaryTerm,
  CatSegment,
  CatTranslationMemoryMatch,
} from "@/components/cat/shared/types";

import type { CatWorkspaceOrchestrator } from "./cat-workspace-orchestrator";
import {
  CatIntelligenceController,
  type CatIntelligenceControllerPorts,
} from "./controllers/cat-intelligence-controller";
import {
  CatReviewController,
  type CatReviewControllerPorts,
} from "./controllers/cat-review-controller";
import { getAiSuggestionForSegment } from "./store/cat-workspace-store-utils";

function getSegmentQueueIndex(segments: Pick<CatSegment, "id" | "key">[], segmentIdOrKey: string) {
  const resolvedId = findSegmentIdByKeyOrIdInQueue(segments, segmentIdOrKey) ?? segmentIdOrKey;
  return segments.findIndex((segment) => segment.id === resolvedId);
}

function getAdjacentSegmentId(
  segments: Pick<CatSegment, "id" | "key">[],
  currentId: string,
  direction: -1 | 1,
) {
  const currentIndex = getSegmentQueueIndex(segments, currentId);
  if (currentIndex < 0) {
    return segments[0]?.id;
  }

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= segments.length) {
    return undefined;
  }

  return segments[nextIndex]?.id;
}

export interface UseCatWorkspaceRuntimeInput {
  store: CatWorkspaceOrchestrator;
  dependencies?: PartialCatWorkspaceDependencies;
  navigation?: Partial<CatWorkspaceNavigation>;
  editing?: Partial<CatWorkspaceEditing>;
  review?: Partial<CatWorkspaceReview>;
  services?: CatWorkspaceServices;
  queueFilter?: CatQueueFilter;
  onQueueFilterChange?: (filter: CatQueueFilter) => void;
  buildSegmentShareUrl?: (segment: CatSegment) => string | null;
  tmAutoFillMinMatchPercent?: number;
  canLookupFreshContext?: boolean;
}

export function useCatWorkspaceRuntime({
  store,
  dependencies: dependencyOverrides,
  navigation: navigationOverrides = dependencyOverrides?.navigation,
  editing: editingOverrides = dependencyOverrides?.editing,
  review: reviewOverrides = dependencyOverrides?.review,
  services: serviceOverrides = dependencyOverrides?.services,
  queueFilter: queueFilterProp,
  onQueueFilterChange,
  buildSegmentShareUrl,
  tmAutoFillMinMatchPercent = TM_AUTO_FILL_MIN_MATCH_PERCENT_DEFAULT,
  canLookupFreshContext = true,
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
  const canLoadVisualContext = Boolean(
    lookupSegmentVisualContext && store.providerKind && store.providerKind !== "native",
  );
  const canUseAiRecommendation = Boolean(generateAiRecommendation);
  const queuePanelSegments = store.getQueuePanelSegments(queueFilter, usesServerQueueFilter);

  const intelligencePorts = useMemo<CatIntelligenceControllerPorts>(
    () => ({
      intl,
      services: serviceOverrides,
      editing: editingOverrides,
      tmAutoFillMinMatchPercent,
    }),
    [editingOverrides, intl, serviceOverrides, tmAutoFillMinMatchPercent],
  );
  const intelligenceController = useMemo(
    () => new CatIntelligenceController(store, intelligencePorts),
    [store],
  );

  const reviewPorts = useMemo<CatReviewControllerPorts>(
    () => ({
      intl,
      services: serviceOverrides,
      review: reviewOverrides,
      loadConcordance: (segmentId, options) =>
        intelligenceController.loadConcordance(segmentId, options),
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
  const reviewController = useMemo(() => new CatReviewController(store, reviewPorts), [store]);

  useEffect(() => {
    intelligenceController.configure(intelligencePorts);
    reviewController.configure(reviewPorts);
  }, [intelligenceController, intelligencePorts, reviewController, reviewPorts]);

  useEffect(() => {
    store.attachControllers(intelligenceController, reviewController);
    store.start();
    return () => store.dispose();
  }, [intelligenceController, reviewController, store]);

  const handleIntelligencePanelVisible = useCallback(
    (segmentId: string) => intelligenceController.panelVisible(segmentId),
    [intelligenceController],
  );

  const dependencies = useMemo<CatWorkspaceDependencies>(() => {
    const editing: CatWorkspaceEditing = {
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
        editing.onTargetChange(segmentId, aiSuggestion);
        onUseAiSuggestion?.(segmentId);
      },
      onUseTmMatch: (segmentId: string, match: CatTranslationMemoryMatch) => {
        editing.onTargetChange(segmentId, match.targetText);
      },
      onUseGlossaryTerm: (segmentId: string, term: CatGlossaryTerm, sourceText: string) => {
        const segment = store.getSegmentView(segmentId);
        const currentTarget = segment?.targetText ?? "";
        editing.onTargetChange(
          segmentId,
          applyGlossaryTermToTarget(sourceText, currentTarget, term),
        );
      },
      ...(editingOverrides?.onTreatAsImage
        ? { onTreatAsImage: editingOverrides.onTreatAsImage }
        : {}),
      ...(editingOverrides?.onRegenerateImage
        ? { onRegenerateImage: editingOverrides.onRegenerateImage }
        : {}),
      ...(editingOverrides?.onUploadImage ? { onUploadImage: editingOverrides.onUploadImage } : {}),
    };

    const navigation: CatWorkspaceNavigation = {
      onSelectSegment: (segmentId: string) => {
        store.attemptSegmentNavigation(() => {
          const selectedSegmentId = store.findSegmentIdByKeyOrId(segmentId) ?? segmentId;
          store.setSelectedSegmentId(selectedSegmentId);
          onSelectSegment?.(segmentId);
        });
      },
      onPreviousSegment: () => {
        store.attemptSegmentNavigation(() => {
          const visibleSegments = store.getFilteredQueueSegments(
            queueFilter,
            usesServerQueueFilter,
          );
          const previousId = getAdjacentSegmentId(visibleSegments, store.selectedSegmentId, -1);
          if (previousId) {
            store.setSelectedSegmentId(previousId);
          }
          onPreviousSegment?.();
        });
      },
      onNextSegment: () => {
        store.attemptSegmentNavigation(() => {
          const visibleSegments = store.getFilteredQueueSegments(
            queueFilter,
            usesServerQueueFilter,
          );
          const nextId = getAdjacentSegmentId(visibleSegments, store.selectedSegmentId, 1);
          if (nextId) {
            store.setSelectedSegmentId(nextId);
          }
          onNextSegment?.();
        });
      },
      onReviewInSequence: () => {
        onReviewInSequence?.();
      },
    };

    const review: CatWorkspaceReview = {
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
    };

    return {
      navigation,
      editing,
      review,
      services: {
        validateFormat,
        runQaChecks,
      },
    };
  }, [
    generateAiRecommendation,
    intelligenceController,
    onAskQuestion,
    onNextSegment,
    onPreviousSegment,
    onReviewInSequence,
    onSaveDraft,
    onSelectSegment,
    onTargetChange,
    onUseAiSuggestion,
    queueFilter,
    runQaChecks,
    reviewController,
    store,
    usesServerQueueFilter,
    validateFormat,
  ]);

  const handleQueueFilterChange = useCallback(
    (filter: CatQueueFilter) => {
      if (onQueueFilterChange) {
        onQueueFilterChange(filter);
        return;
      }

      store.setQueueFilter(filter);
    },
    [onQueueFilterChange, store],
  );

  const handleBulkApprove = useCallback(() => reviewController.bulkApprove(), [reviewController]);
  const handleBulkSkip = useCallback(() => reviewController.bulkSkip(), [reviewController]);

  const resolvedBuildSegmentShareUrl = useMemo(() => {
    if (buildSegmentShareUrl) {
      return buildSegmentShareUrl;
    }

    if (typeof window === "undefined") {
      return undefined;
    }

    return (segment: CatSegment) =>
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
    resolvedBuildSegmentShareUrl,
    canLookupContext,
    canLoadVisualContext,
    canUseAiRecommendation,
    handleIntelligencePanelVisible,
  };
}
