"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useIntl } from "react-intl";

import { applyGlossaryTermToTarget } from "@/components/cat/intelligence/cat-glossary-utils";
import {
  selectBestTmMatchForAutoFill,
  TM_AUTO_FILL_MIN_MATCH_PERCENT_DEFAULT,
} from "@/components/cat/intelligence/tm-match-quality";
import {
  resolveVisibleQueueSegments,
  type CatQueueFilter,
} from "@/components/cat/queue/cat-queue-filter";
import { buildCatSegmentShareUrl } from "@/components/cat/segment/cat-segment-share-link";
import {
  catEditorPanelMessages,
  catIntelligencePanelMessages,
  catWorkspaceContainerMessages,
} from "@/components/cat/shared/cat.messages";
import type {
  CatAiRecommendationResult,
  CatWorkspaceDependencies,
  CatWorkspaceEditing,
  CatWorkspaceNavigation,
  CatWorkspaceReview,
  CatWorkspaceServices,
  PartialCatWorkspaceDependencies,
} from "@/components/cat/shared/dependencies";
import type {
  CatFormatCheck,
  CatGlossaryTerm,
  CatSegment,
  CatSegmentCommentInput,
  CatSegmentStatus,
  CatTranslationMemoryMatch,
  CatWorkspaceState,
} from "@/components/cat/shared/types";

import {
  getAiSuggestionForSegment,
  glossaryTermsForSegment,
} from "./store/cat-workspace-store-utils";
import type { CatWorkspaceStore } from "./store/cat-workspace-store";

function getSegmentQueueIndex(segments: CatSegment[], segmentIdOrKey: string) {
  return segments.findIndex(
    (segment) => segment.id === segmentIdOrKey || segment.key === segmentIdOrKey,
  );
}

function getSegmentId(segments: CatSegment[], segmentIdOrKey: string) {
  const segment = segments.find(
    (item) => item.id === segmentIdOrKey || item.key === segmentIdOrKey,
  );

  return segment?.id;
}

function getAdjacentSegmentId(segments: CatSegment[], currentId: string, direction: -1 | 1) {
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

export interface UseCatWorkspaceControllerInput {
  store: CatWorkspaceStore;
  initialState: CatWorkspaceState;
  initialSegmentKeyOrId?: string | null;
  dependencies?: PartialCatWorkspaceDependencies;
  navigation?: Partial<CatWorkspaceNavigation>;
  editing?: Partial<CatWorkspaceEditing>;
  review?: Partial<CatWorkspaceReview>;
  services?: CatWorkspaceServices;
  queueFilter?: CatQueueFilter;
  onQueueFilterChange?: (filter: CatQueueFilter) => void;
  buildSegmentShareUrl?: (segment: CatSegment) => string | null;
  tmAutoFillMinMatchPercent?: number;
}

export function useCatWorkspaceController({
  store,
  initialState,
  initialSegmentKeyOrId,
  dependencies: dependencyOverrides,
  navigation: navigationOverrides = dependencyOverrides?.navigation,
  editing: editingOverrides = dependencyOverrides?.editing,
  review: reviewOverrides = dependencyOverrides?.review,
  services: serviceOverrides = dependencyOverrides?.services,
  queueFilter: queueFilterProp,
  onQueueFilterChange,
  buildSegmentShareUrl,
  tmAutoFillMinMatchPercent = TM_AUTO_FILL_MIN_MATCH_PERCENT_DEFAULT,
}: UseCatWorkspaceControllerInput) {
  const intl = useIntl();
  const queueFilter = queueFilterProp ?? store.queueFilter;
  const usesServerQueueFilter = Boolean(onQueueFilterChange);

  const validateFormat = serviceOverrides?.validateFormat;
  const runQaChecks = serviceOverrides?.runQaChecks;
  const lookupSegmentContext = serviceOverrides?.lookupSegmentContext;
  const lookupSegmentConcordance = serviceOverrides?.lookupSegmentConcordance;
  const lookupSegmentVisualContext = serviceOverrides?.lookupSegmentVisualContext;
  const generateAiRecommendation = serviceOverrides?.generateAiRecommendation;

  const onSelectSegment = navigationOverrides?.onSelectSegment;
  const onPreviousSegment = navigationOverrides?.onPreviousSegment;
  const onNextSegment = navigationOverrides?.onNextSegment;
  const onReviewInSequence = navigationOverrides?.onReviewInSequence;
  const onTargetChange = editingOverrides?.onTargetChange;
  const onUseAiSuggestion = editingOverrides?.onUseAiSuggestion;
  const onApprove = reviewOverrides?.onApprove;
  const onSaveDraft = reviewOverrides?.onSaveDraft;
  const onAddComment = reviewOverrides?.onAddComment;
  const onResolveComment = reviewOverrides?.onResolveComment;
  const onAskQuestion = reviewOverrides?.onAskQuestion;
  const onReviewWithAi = reviewOverrides?.onReviewWithAi;
  const onSkip = reviewOverrides?.onSkip;
  const onBulkApprove = reviewOverrides?.onBulkApprove;
  const onBulkSkip = reviewOverrides?.onBulkSkip;

  const canLookupContext = Boolean(lookupSegmentContext);
  const canLoadVisualContext = Boolean(
    lookupSegmentVisualContext && store.providerKind && store.providerKind !== "native",
  );
  const canUseAiRecommendation = Boolean(generateAiRecommendation);
  const canRunSegmentReview = Boolean(validateFormat || runQaChecks);

  const isInitialHydrationRef = useRef(true);

  useEffect(() => {
    if (isInitialHydrationRef.current) {
      isInitialHydrationRef.current = false;
      return;
    }

    store.hydrateFromServerSnapshot(initialState, initialSegmentKeyOrId);
  }, [initialSegmentKeyOrId, initialState, store]);

  const filteredSegments = useMemo(
    () => resolveVisibleQueueSegments(store.segments, queueFilter, usesServerQueueFilter),
    [queueFilter, store.segments, usesServerQueueFilter],
  );

  useEffect(() => {
    if (filteredSegments.some((segment) => segment.id === store.selectedSegmentId)) {
      return;
    }

    const nextSelectedSegmentId = filteredSegments[0]?.id;
    if (nextSelectedSegmentId) {
      store.setSelectedSegmentId(nextSelectedSegmentId);
    }
  }, [filteredSegments, store]);

  useEffect(() => {
    store.pruneCheckedToVisible(new Set(store.segments.map((segment) => segment.id)));
  }, [store, store.segments]);

  useEffect(() => {
    if (store.dirtySegmentIds.size === 0) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [store.dirtySegmentIds]);

  useEffect(() => {
    store.clearCommentPostError();
  }, [store, store.selectedSegmentId]);

  const runSegmentChecks = useCallback(
    async (segment: CatSegment, value: string, glossaryTermsOverride?: CatGlossaryTerm[]) => {
      if (!validateFormat && !runQaChecks) {
        return;
      }

      const sequence = store.beginValidation();
      try {
        const glossaryTerms =
          glossaryTermsOverride ?? glossaryTermsForSegment(store.workspaceState, segment.id);
        const [formatChecks, qaChecks] = await Promise.all([
          validateFormat ? validateFormat(segment, value, glossaryTerms) : Promise.resolve([]),
          runQaChecks ? runQaChecks(segment, value) : Promise.resolve([]),
        ]);
        if (!store.isValidationCurrent(sequence)) {
          return;
        }
        const checks = [...formatChecks, ...qaChecks];
        store.setFormatChecks(segment.id, checks, store.selectedSegmentId === segment.id);
      } finally {
        store.completeValidation(sequence);
      }
    },
    [runQaChecks, store, validateFormat],
  );

  const runSegmentReview = useCallback(
    async (segmentId: string, options?: { includeAi?: boolean; includeConcordance?: boolean }) => {
      await onReviewWithAi?.(segmentId);

      const segment = store.segments.find((item) => item.id === segmentId);
      if (!segment) {
        return;
      }

      const includeAi = options?.includeAi === true && Boolean(generateAiRecommendation);
      const includeFormatChecks = Boolean(validateFormat || runQaChecks);
      const includeConcordance =
        Boolean(lookupSegmentConcordance) && (options?.includeConcordance === true || includeAi);
      const showFormatChecksLoading = includeFormatChecks && !includeAi;

      if (!includeAi && !includeFormatChecks && !includeConcordance) {
        return;
      }

      const currentIntelligence = store.segmentIntelligence[segmentId] ?? store.intelligence;

      const sequence = store.beginReview({ includeAi, showFormatChecksLoading });
      try {
        let recommendation: CatAiRecommendationResult | undefined;
        let aiFailureCheck: CatFormatCheck | undefined;
        let intelligenceForRecommendation = currentIntelligence;

        if (includeConcordance && lookupSegmentConcordance) {
          store.setReviewPhaseLoading(sequence, "concordance", true);
          try {
            const concordance = await lookupSegmentConcordance(segment);
            if (!store.isReviewCurrent(sequence)) {
              return;
            }

            intelligenceForRecommendation = {
              ...currentIntelligence,
              glossaryTerms: concordance.glossaryTerms,
              translationMemoryMatches: concordance.translationMemoryMatches,
            };

            store.mergeSegmentIntelligence(segmentId, {
              glossaryTerms: concordance.glossaryTerms,
              translationMemoryMatches: concordance.translationMemoryMatches,
            });

            const currentSegment = store.segments.find((item) => item.id === segmentId);
            const bestTmMatch = selectBestTmMatchForAutoFill(
              concordance.translationMemoryMatches,
              tmAutoFillMinMatchPercent,
            );
            if (
              currentSegment &&
              !currentSegment.targetText.trim() &&
              bestTmMatch &&
              !store.autoFilledSegmentIds.has(segmentId)
            ) {
              store.autoFilledSegmentIds = new Set([...store.autoFilledSegmentIds, segmentId]);
              store.setTargetText(segmentId, bestTmMatch.targetText);
              store.markSegmentSaved(segmentId, bestTmMatch.targetText);
              onTargetChange?.(segmentId, bestTmMatch.targetText);
            }
          } catch (error) {
            if (!store.isReviewCurrent(sequence)) {
              return;
            }

            const message =
              error instanceof Error
                ? error.message
                : intl.formatMessage(catWorkspaceContainerMessages.concordanceSearchFailed);
            store.upsertFormatCheck(segmentId, {
              id: `concordance-failed-${segmentId}`,
              label: intl.formatMessage(catWorkspaceContainerMessages.concordanceSearchLabel),
              status: "fail",
              message,
              category: "qa",
            });
          } finally {
            store.setReviewPhaseLoading(sequence, "concordance", false);
          }
        }

        const segmentForReview = store.segments.find((item) => item.id === segmentId) ?? segment;

        if (includeAi && generateAiRecommendation) {
          try {
            recommendation = await generateAiRecommendation(
              segmentForReview,
              segmentForReview.targetText,
              intelligenceForRecommendation,
            );
          } catch (error) {
            if (!store.isReviewCurrent(sequence)) {
              return;
            }

            const message =
              error instanceof Error
                ? error.message
                : intl.formatMessage(catWorkspaceContainerMessages.aiRecommendationFailed);
            aiFailureCheck = {
              id: `ai-recommendation-failed-${segmentId}`,
              label: intl.formatMessage(catWorkspaceContainerMessages.aiRecommendationLabel),
              status: "fail",
              message,
              category: "qa",
            };
          }
        }

        if (includeFormatChecks || includeAi) {
          const [formatChecks, qaChecks] = await Promise.all([
            includeFormatChecks && validateFormat
              ? validateFormat(
                  segmentForReview,
                  segmentForReview.targetText,
                  intelligenceForRecommendation.glossaryTerms,
                )
              : Promise.resolve([]),
            includeFormatChecks && runQaChecks
              ? runQaChecks(segmentForReview, segmentForReview.targetText)
              : Promise.resolve([]),
          ]);
          if (!store.isReviewCurrent(sequence)) {
            return;
          }
          const withoutAiFailure = (segmentChecks: CatFormatCheck[]) =>
            segmentChecks.filter((check) => check.id !== `ai-recommendation-failed-${segmentId}`);
          const baseChecks = withoutAiFailure(
            recommendation?.formatChecks ?? [...formatChecks, ...qaChecks],
          );
          const checks = aiFailureCheck
            ? [aiFailureCheck, ...baseChecks.filter((check) => check.id !== aiFailureCheck.id)]
            : baseChecks;

          store.setFormatChecks(segmentId, checks, store.selectedSegmentId === segmentId);
          if (recommendation) {
            store.mergeSegmentIntelligence(segmentId, {
              aiSuggestion: recommendation.aiSuggestion,
              aiReasoning: recommendation.aiReasoning,
            });
          }
        }
      } finally {
        store.setReviewPhaseLoading(sequence, "ai", false);
        store.setReviewPhaseLoading(sequence, "formatChecks", false);
      }
    },
    [
      generateAiRecommendation,
      intl,
      lookupSegmentConcordance,
      onReviewWithAi,
      onTargetChange,
      runQaChecks,
      runSegmentChecks,
      store,
      tmAutoFillMinMatchPercent,
      validateFormat,
    ],
  );

  const runSegmentReviewRef = useRef(runSegmentReview);
  runSegmentReviewRef.current = runSegmentReview;

  useEffect(() => {
    const segmentId = store.selectedSegmentId;
    if (!segmentId || !canRunSegmentReview) {
      return;
    }

    void runSegmentReviewRef.current(segmentId, { includeAi: false });
  }, [canRunSegmentReview, store.selectedSegmentId]);

  const concordanceLookupAttemptedRef = useRef(new Set<string>());
  const cachedContextLookupAttemptedRef = useRef(new Set<string>());
  const visualContextLookupAttemptedRef = useRef(new Set<string>());
  const visualContextLoadingSegmentIdRef = useRef<string | null>(null);

  useEffect(() => {
    concordanceLookupAttemptedRef.current.clear();
  }, [lookupSegmentConcordance]);

  useEffect(() => {
    cachedContextLookupAttemptedRef.current.clear();
  }, [lookupSegmentContext]);

  useEffect(() => {
    visualContextLookupAttemptedRef.current.clear();
  }, [lookupSegmentVisualContext]);

  const handleIntelligencePanelVisible = useCallback(
    (segmentId: string) => {
      const segment = store.segments.find((item) => item.id === segmentId);
      if (!segment) {
        return;
      }

      if (lookupSegmentConcordance && !concordanceLookupAttemptedRef.current.has(segmentId)) {
        concordanceLookupAttemptedRef.current.add(segmentId);
        void runSegmentReviewRef.current(segmentId, {
          includeAi: false,
          includeConcordance: true,
        });
      }

      if (lookupSegmentContext) {
        const existingAgentContext = store.segmentIntelligence[segmentId]?.agentContext;
        if (
          existingAgentContext === undefined &&
          !cachedContextLookupAttemptedRef.current.has(segmentId)
        ) {
          cachedContextLookupAttemptedRef.current.add(segmentId);
          void lookupSegmentContext(segment, { cachedOnly: true })
            .then((agentContext) => {
              if (!agentContext?.trim()) {
                return;
              }

              store.mergeSegmentIntelligence(segmentId, { agentContext });
              store.revealAgentContext(segmentId);
              store.removeFormatCheck(segmentId, `context-lookup-failed-${segmentId}`);
            })
            .catch(() => undefined);
        }
      }

      if (!lookupSegmentVisualContext || !canLoadVisualContext) {
        return;
      }

      const existingVisualContext = store.segmentIntelligence[segmentId]?.visualContext;
      if (existingVisualContext) {
        store.isLoadingVisualContext = false;
        visualContextLoadingSegmentIdRef.current = null;
        return;
      }

      if (visualContextLookupAttemptedRef.current.has(segmentId)) {
        return;
      }

      visualContextLookupAttemptedRef.current.add(segmentId);
      store.isLoadingVisualContext = true;
      visualContextLoadingSegmentIdRef.current = segmentId;

      void lookupSegmentVisualContext(segment)
        .then((visualContext) => {
          store.mergeSegmentIntelligence(segmentId, { visualContext });
        })
        .catch(() => {
          store.upsertFormatCheck(segmentId, {
            id: `visual-context-failed-${segmentId}`,
            label: intl.formatMessage(catIntelligencePanelMessages.panelTitle),
            status: "warn",
            message: intl.formatMessage(catWorkspaceContainerMessages.visualContextLoadFailed),
            category: "qa",
          });
        })
        .finally(() => {
          if (segmentId === visualContextLoadingSegmentIdRef.current) {
            store.isLoadingVisualContext = false;
            visualContextLoadingSegmentIdRef.current = null;
          }
        });
    },
    [
      canLoadVisualContext,
      intl,
      lookupSegmentConcordance,
      lookupSegmentContext,
      lookupSegmentVisualContext,
      store,
    ],
  );

  const dependencies = useMemo<CatWorkspaceDependencies>(() => {
    const editing: CatWorkspaceEditing = {
      onTargetChange: (segmentId: string, value: string) => {
        store.setTargetText(segmentId, value);
        const segmentToValidate = store.segments.find((item) => item.id === segmentId);
        if (segmentToValidate) {
          void runSegmentChecks(segmentToValidate, value);
        }
        onTargetChange?.(segmentId, value);
      },
      onUseAiSuggestion: (segmentId: string) => {
        const aiSuggestion = getAiSuggestionForSegment(store.workspaceState, segmentId);
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
        const segment = store.segments.find((item) => item.id === segmentId);
        const currentTarget = segment?.targetText ?? "";
        editing.onTargetChange(
          segmentId,
          applyGlossaryTermToTarget(sourceText, currentTarget, term),
        );
      },
    };

    const navigation: CatWorkspaceNavigation = {
      onSelectSegment: (segmentId: string) => {
        store.attemptSegmentNavigation(() => {
          const selectedSegmentId = getSegmentId(store.segments, segmentId) ?? segmentId;
          store.setSelectedSegmentId(selectedSegmentId);
          onSelectSegment?.(segmentId);
        });
      },
      onPreviousSegment: () => {
        store.attemptSegmentNavigation(() => {
          const visibleSegments = resolveVisibleQueueSegments(
            store.segments,
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
          const visibleSegments = resolveVisibleQueueSegments(
            store.segments,
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
      onApprove: async (segmentId: string, targetText: string) => {
        store.isApproving = true;
        try {
          const nextStatus = (await onApprove?.(segmentId, targetText)) ?? "reviewed";
          store.markSegmentSaved(segmentId, targetText, nextStatus as CatSegmentStatus);
          const visibleSegments = resolveVisibleQueueSegments(
            store.segments,
            queueFilter,
            usesServerQueueFilter,
          );
          const nextSelectedSegmentId =
            getAdjacentSegmentId(visibleSegments, segmentId, 1) ?? store.selectedSegmentId;
          store.setSelectedSegmentId(nextSelectedSegmentId);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : intl.formatMessage(catWorkspaceContainerMessages.saveTranslationFailed);
          store.addSaveFailureCheck(
            segmentId,
            message,
            intl.formatMessage(catWorkspaceContainerMessages.saveFailedLabel),
          );
        } finally {
          store.isApproving = false;
        }
      },
      ...(onSaveDraft
        ? {
            onSaveDraft: async (segmentId: string, targetText: string) => {
              store.isSavingDraft = true;
              try {
                const nextStatus = (await onSaveDraft(segmentId, targetText)) ?? "needs_review";
                store.markSegmentSaved(segmentId, targetText, nextStatus as CatSegmentStatus);
              } catch (error) {
                const message =
                  error instanceof Error
                    ? error.message
                    : intl.formatMessage(catWorkspaceContainerMessages.saveTranslationFailed);
                store.addSaveFailureCheck(
                  segmentId,
                  message,
                  intl.formatMessage(catWorkspaceContainerMessages.saveFailedLabel),
                );
              } finally {
                store.isSavingDraft = false;
              }
            },
          }
        : {}),
      onAddComment: async (segmentId: string, input: CatSegmentCommentInput) => {
        if (!onAddComment) {
          return;
        }

        store.commentPostError = undefined;
        store.isPostingComment = true;
        try {
          await onAddComment(segmentId, input);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : intl.formatMessage(catEditorPanelMessages.commentPostFailed);
          store.commentPostError = message;
          throw error;
        } finally {
          store.isPostingComment = false;
        }
      },
      onResolveComment: async (segmentId: string, commentId: string) => {
        if (!onResolveComment) {
          return;
        }

        store.commentPostError = undefined;
        store.resolvingCommentId = commentId;
        store.isResolvingComment = true;
        try {
          await onResolveComment(segmentId, commentId);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : intl.formatMessage(catEditorPanelMessages.commentResolveFailed);
          store.commentPostError = message;
          throw error;
        } finally {
          store.isResolvingComment = false;
          store.resolvingCommentId = null;
        }
      },
      onAskQuestion: async (segmentId: string, options?: { forceRefresh?: boolean }) => {
        await onAskQuestion?.(segmentId, options);
        if (!lookupSegmentContext) {
          return;
        }

        const segment = store.segments.find((item) => item.id === segmentId);
        if (!segment) {
          return;
        }

        const existingAgentContext = store.segmentIntelligence[segmentId]?.agentContext;
        store.revealAgentContext(segmentId);
        if (Boolean(existingAgentContext?.trim()) && !options?.forceRefresh) {
          return;
        }

        store.isLookingUpContext = true;
        try {
          const agentContext = await lookupSegmentContext(segment, {
            forceRefresh: options?.forceRefresh === true,
          });
          store.removeFormatCheck(segmentId, `context-lookup-failed-${segmentId}`);
          store.mergeSegmentIntelligence(segmentId, { agentContext });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : intl.formatMessage(catWorkspaceContainerMessages.contextLookupFailed);
          store.upsertFormatCheck(segmentId, {
            id: `context-lookup-failed-${segmentId}`,
            label: intl.formatMessage(catWorkspaceContainerMessages.contextLookupLabel),
            status: "fail",
            message,
            category: "qa",
          });
        } finally {
          store.isLookingUpContext = false;
        }
      },
      onReviewWithAi: async (segmentId: string) => {
        await runSegmentReview(segmentId, { includeAi: true });
      },
      onSkip: (segmentId: string) => {
        store.setSegmentStatus(segmentId, "skipped");
        onSkip?.(segmentId);
      },
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
    intl,
    lookupSegmentContext,
    onAddComment,
    onApprove,
    onNextSegment,
    onPreviousSegment,
    onResolveComment,
    onReviewInSequence,
    onSaveDraft,
    onSelectSegment,
    onSkip,
    onTargetChange,
    onUseAiSuggestion,
    queueFilter,
    runQaChecks,
    runSegmentChecks,
    runSegmentReview,
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

  const handleBulkApprove = useCallback(async () => {
    const segmentIds = [...store.checkedSegmentIds];
    if (segmentIds.length === 0) {
      return;
    }

    store.isBulkActionPending = true;
    try {
      if (onBulkApprove) {
        await onBulkApprove(segmentIds);
        store.clearChecked();
        return;
      }

      for (const segmentId of segmentIds) {
        const segment = store.segments.find((item) => item.id === segmentId);
        if (!segment) {
          continue;
        }

        await dependencies.review.onApprove(segmentId, segment.targetText);
      }
    } finally {
      store.isBulkActionPending = false;
      store.clearChecked();
    }
  }, [dependencies.review, onBulkApprove, store]);

  const handleBulkSkip = useCallback(async () => {
    const segmentIds = [...store.checkedSegmentIds];
    if (segmentIds.length === 0) {
      return;
    }

    store.isBulkActionPending = true;
    try {
      if (onBulkSkip) {
        await onBulkSkip(segmentIds);
        return;
      }

      for (const segmentId of segmentIds) {
        dependencies.review.onSkip(segmentId);
      }
    } finally {
      store.isBulkActionPending = false;
      store.clearChecked();
    }
  }, [dependencies.review, onBulkSkip, store]);

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

  const queueViewState = useMemo(
    () => ({
      ...store.workspaceState,
      segments: filteredSegments,
    }),
    [filteredSegments, store.workspaceState],
  );

  return {
    queueViewState,
    editorState: store.workspaceState,
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
