"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";

import type {
  CatAiRecommendationResult,
  CatWorkspaceDependencies,
  CatWorkspaceEditing,
  CatWorkspaceNavigation,
  CatWorkspaceReview,
  CatWorkspaceServices,
  CatWorkspaceViewProps,
  PartialCatWorkspaceDependencies,
} from "./dependencies";
import { CatWorkspaceView } from "./cat-workspace";
import { catEditorPanelMessages, catWorkspaceContainerMessages } from "./cat.messages";
import type { CatFormatCheck, CatSegment, CatWorkspaceState } from "./types";

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

function updateSegmentTarget(segments: CatSegment[], segmentId: string, targetText: string) {
  return segments.map((segment) =>
    segment.id === segmentId ? { ...segment, targetText } : segment,
  );
}

function updateSegmentStatus(
  segments: CatSegment[],
  segmentId: string,
  status: CatSegment["status"],
) {
  return segments.map((segment) => (segment.id === segmentId ? { ...segment, status } : segment));
}

function countReviewed(segments: CatSegment[]) {
  return segments.filter((segment) => segment.status === "reviewed").length;
}

function getSegmentsById(state: CatWorkspaceState) {
  return new Map(state.segments.map((segment) => [segment.id, segment]));
}

function withoutSaveFailureChecks(checks: CatFormatCheck[]) {
  return checks.filter((check) => !check.id.startsWith("save-failed-"));
}

function hasSaveFailureCheck(checks: CatFormatCheck[]) {
  return checks.some((check) => check.id.startsWith("save-failed-"));
}

export function addSaveFailureFormatCheck(
  state: CatWorkspaceState,
  segmentId: string,
  message: string,
  label: string,
): Pick<CatWorkspaceState, "formatChecks" | "segmentFormatChecks"> {
  const saveFailureCheck: CatFormatCheck = {
    id: `save-failed-${segmentId}`,
    label,
    status: "fail",
    message,
    category: "qa",
  };
  const segmentChecks = state.segmentFormatChecks?.[segmentId] ?? state.formatChecks;

  return {
    formatChecks: [saveFailureCheck, ...withoutSaveFailureChecks(state.formatChecks)],
    segmentFormatChecks: {
      ...state.segmentFormatChecks,
      [segmentId]: [saveFailureCheck, ...withoutSaveFailureChecks(segmentChecks)],
    },
  };
}

export function getAiSuggestionForSegment(state: CatWorkspaceState, segmentId: string) {
  return state.segmentIntelligence?.[segmentId]?.aiSuggestion ?? state.intelligence.aiSuggestion;
}

export function mergeCatWorkspaceState(
  previousInitialState: CatWorkspaceState,
  currentState: CatWorkspaceState,
  nextInitialState: CatWorkspaceState,
): CatWorkspaceState {
  const previousSegments = getSegmentsById(previousInitialState);
  const currentSegments = getSegmentsById(currentState);
  const segments = nextInitialState.segments.map((nextSegment) => {
    const previousSegment = previousSegments.get(nextSegment.id);
    const currentSegment = currentSegments.get(nextSegment.id);
    if (!previousSegment || !currentSegment) {
      return nextSegment;
    }

    if (currentSegment.targetText === previousSegment.targetText) {
      return nextSegment;
    }

    return {
      ...nextSegment,
      targetText: currentSegment.targetText,
    };
  });
  const nextSegmentIds = new Set(segments.map((segment) => segment.id));
  const selectedSegmentId = nextSegmentIds.has(currentState.selectedSegmentId)
    ? currentState.selectedSegmentId
    : (nextInitialState.selectedSegmentId ?? segments[0]?.id ?? "");
  const segmentFormatChecks: CatWorkspaceState["segmentFormatChecks"] = {
    ...nextInitialState.segmentFormatChecks,
  };
  const segmentIntelligence: CatWorkspaceState["segmentIntelligence"] = {
    ...nextInitialState.segmentIntelligence,
  };
  for (const segment of segments) {
    const previousSegment = previousSegments.get(segment.id);
    const currentSegment = currentSegments.get(segment.id);
    const currentChecks = currentState.segmentFormatChecks?.[segment.id];
    if (
      previousSegment &&
      currentSegment &&
      currentChecks &&
      (currentSegment.targetText !== previousSegment.targetText ||
        hasSaveFailureCheck(currentChecks))
    ) {
      segmentFormatChecks[segment.id] = currentChecks;
    }

    const nextAgentContext = nextInitialState.segmentIntelligence?.[segment.id]?.agentContext;
    const currentAgentContext = currentState.segmentIntelligence?.[segment.id]?.agentContext;
    if (!nextAgentContext?.trim() && currentAgentContext?.trim()) {
      segmentIntelligence[segment.id] = {
        ...(segmentIntelligence[segment.id] ?? nextInitialState.intelligence),
        ...currentState.segmentIntelligence?.[segment.id],
        agentContext: currentAgentContext,
      };
    }

    const nextConcordance = nextInitialState.segmentIntelligence?.[segment.id];
    const currentConcordance = currentState.segmentIntelligence?.[segment.id];
    const hasCurrentConcordance =
      (currentConcordance?.glossaryTerms.length ?? 0) > 0 ||
      (currentConcordance?.translationMemoryMatches?.length ?? 0) > 0;
    const hasNextConcordance =
      (nextConcordance?.glossaryTerms.length ?? 0) > 0 ||
      (nextConcordance?.translationMemoryMatches?.length ?? 0) > 0;
    if (hasCurrentConcordance && !hasNextConcordance) {
      segmentIntelligence[segment.id] = {
        ...(segmentIntelligence[segment.id] ?? nextInitialState.intelligence),
        ...currentState.segmentIntelligence?.[segment.id],
        glossaryTerms: currentConcordance?.glossaryTerms ?? [],
        translationMemoryMatches: currentConcordance?.translationMemoryMatches,
      };
    }
  }

  return {
    ...nextInitialState,
    segments,
    selectedSegmentId,
    queueSummary: {
      total: segments.length,
      reviewed: countReviewed(segments),
    },
    formatChecks:
      selectedSegmentId === currentState.selectedSegmentId
        ? currentState.formatChecks
        : nextInitialState.formatChecks,
    segmentFormatChecks,
    segmentIntelligence,
  };
}

export interface CatWorkspaceContainerProps {
  initialState: CatWorkspaceState;
  dependencies?: PartialCatWorkspaceDependencies;
  navigation?: Partial<CatWorkspaceNavigation>;
  editing?: Partial<CatWorkspaceEditing>;
  review?: Partial<CatWorkspaceReview>;
  services?: CatWorkspaceServices;
  className?: string;
  queueSearch?: string;
  onQueueSearchChange?: (value: string) => void;
  isQueueSearchPending?: boolean;
  isQueueFetchingPage?: boolean;
  queuePagination?: CatWorkspaceViewProps["queuePagination"];
  onQueuePreviousPage?: () => void;
  onQueueNextPage?: () => void;
  onQueueNearEnd?: () => void;
}

function collectSegmentsWithAgentContext(state: CatWorkspaceState): ReadonlySet<string> {
  return new Set(
    state.segments
      .filter((segment) => Boolean(state.segmentIntelligence?.[segment.id]?.agentContext?.trim()))
      .map((segment) => segment.id),
  );
}

export function CatWorkspaceContainer({
  initialState,
  dependencies: dependencyOverrides,
  navigation: navigationOverrides = dependencyOverrides?.navigation,
  editing: editingOverrides = dependencyOverrides?.editing,
  review: reviewOverrides = dependencyOverrides?.review,
  services: serviceOverrides = dependencyOverrides?.services,
  className,
  queueSearch,
  onQueueSearchChange,
  isQueueSearchPending,
  isQueueFetchingPage,
  queuePagination,
  onQueuePreviousPage,
  onQueueNextPage,
  onQueueNearEnd,
}: CatWorkspaceContainerProps) {
  const intl = useIntl();
  const [state, setState] = useState(initialState);
  const [isValidating, setIsValidating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentPostError, setCommentPostError] = useState<string | undefined>();
  const [isLookingUpContext, setIsLookingUpContext] = useState(false);
  const [isLoadingConcordance, setIsLoadingConcordance] = useState(false);
  const [revealedAgentContextSegmentIds, setRevealedAgentContextSegmentIds] = useState<
    ReadonlySet<string>
  >(() => collectSegmentsWithAgentContext(initialState));
  const [isGeneratingAiRecommendation, setIsGeneratingAiRecommendation] = useState(false);
  const [isRunningFormatChecks, setIsRunningFormatChecks] = useState(false);
  const stateRef = useRef(state);
  const previousInitialStateRef = useRef(initialState);
  const validationSequenceRef = useRef(0);
  const reviewSequenceRef = useRef(0);
  const validateFormat = serviceOverrides?.validateFormat;
  const runQaChecks = serviceOverrides?.runQaChecks;
  const lookupSegmentContext = serviceOverrides?.lookupSegmentContext;
  const lookupSegmentConcordance = serviceOverrides?.lookupSegmentConcordance;
  const generateAiRecommendation = serviceOverrides?.generateAiRecommendation;
  const canLookupContext = Boolean(lookupSegmentContext);
  const canUseAiRecommendation = Boolean(generateAiRecommendation);
  const canRunSegmentReview = Boolean(generateAiRecommendation || validateFormat || runQaChecks);
  const onSelectSegment = navigationOverrides?.onSelectSegment;
  const onPreviousSegment = navigationOverrides?.onPreviousSegment;
  const onNextSegment = navigationOverrides?.onNextSegment;
  const onReviewInSequence = navigationOverrides?.onReviewInSequence;
  const onTargetChange = editingOverrides?.onTargetChange;
  const onUseAiSuggestion = editingOverrides?.onUseAiSuggestion;
  const onApprove = reviewOverrides?.onApprove;
  const onAddComment = reviewOverrides?.onAddComment;
  const onAskQuestion = reviewOverrides?.onAskQuestion;
  const onReviewWithAi = reviewOverrides?.onReviewWithAi;
  const onSkip = reviewOverrides?.onSkip;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setState((current) =>
      mergeCatWorkspaceState(previousInitialStateRef.current, current, initialState),
    );
    previousInitialStateRef.current = initialState;
    setRevealedAgentContextSegmentIds((current) => {
      const next = collectSegmentsWithAgentContext(initialState);
      return new Set([...current, ...next]);
    });
  }, [initialState]);

  useEffect(() => {
    setCommentPostError(undefined);
  }, [state.selectedSegmentId]);

  const runSegmentChecks = useCallback(
    async (segment: CatSegment, value: string) => {
      if (!validateFormat && !runQaChecks) {
        return;
      }

      const sequence = validationSequenceRef.current + 1;
      validationSequenceRef.current = sequence;
      setIsValidating(true);
      try {
        const [formatChecks, qaChecks] = await Promise.all([
          validateFormat ? validateFormat(segment, value) : Promise.resolve([]),
          runQaChecks ? runQaChecks(segment, value) : Promise.resolve([]),
        ]);
        if (validationSequenceRef.current !== sequence) {
          return;
        }
        const checks = [...formatChecks, ...qaChecks];
        setState((current) => ({
          ...current,
          formatChecks: checks,
          segmentFormatChecks: {
            ...current.segmentFormatChecks,
            [segment.id]: checks,
          },
        }));
      } finally {
        if (validationSequenceRef.current === sequence) {
          setIsValidating(false);
        }
      }
    },
    [runQaChecks, validateFormat],
  );

  const runSegmentReview = useCallback(
    async (segmentId: string, options?: { includeAi?: boolean }) => {
      await onReviewWithAi?.(segmentId);

      const segment = stateRef.current.segments.find((item) => item.id === segmentId);
      if (!segment) {
        return;
      }

      const includeAi = options?.includeAi === true && Boolean(generateAiRecommendation);
      const includeFormatChecks = Boolean(validateFormat || runQaChecks);

      if (!includeAi && !includeFormatChecks) {
        return;
      }

      const currentIntelligence =
        stateRef.current.segmentIntelligence?.[segmentId] ?? stateRef.current.intelligence;

      const sequence = reviewSequenceRef.current + 1;
      reviewSequenceRef.current = sequence;
      if (includeAi) {
        setIsGeneratingAiRecommendation(true);
      }
      if (includeFormatChecks) {
        setIsRunningFormatChecks(true);
      }
      try {
        let recommendation: CatAiRecommendationResult | undefined;
        let aiFailureCheck: CatFormatCheck | undefined;
        let intelligenceForRecommendation = currentIntelligence;

        if (lookupSegmentConcordance) {
          setIsLoadingConcordance(true);
          try {
            const concordance = await lookupSegmentConcordance(segment);
            if (reviewSequenceRef.current !== sequence) {
              return;
            }

            intelligenceForRecommendation = {
              ...currentIntelligence,
              glossaryTerms: concordance.glossaryTerms,
              translationMemoryMatches: concordance.translationMemoryMatches,
            };

            setState((current) => {
              const segmentIntelligence =
                current.segmentIntelligence?.[segmentId] ?? current.intelligence;

              return {
                ...current,
                segmentIntelligence: {
                  ...current.segmentIntelligence,
                  [segmentId]: {
                    ...segmentIntelligence,
                    glossaryTerms: concordance.glossaryTerms,
                    translationMemoryMatches: concordance.translationMemoryMatches,
                  },
                },
              };
            });
          } catch (error) {
            if (reviewSequenceRef.current !== sequence) {
              return;
            }

            const message =
              error instanceof Error
                ? error.message
                : intl.formatMessage(catWorkspaceContainerMessages.concordanceSearchFailed);
            const concordanceFailureCheck: CatFormatCheck = {
              id: `concordance-failed-${segmentId}`,
              label: intl.formatMessage(catWorkspaceContainerMessages.concordanceSearchLabel),
              status: "fail",
              message,
              category: "qa",
            };

            setState((current) => {
              const currentChecks =
                current.segmentFormatChecks?.[segmentId] ?? current.formatChecks;
              const nextChecks = [
                concordanceFailureCheck,
                ...currentChecks.filter((check) => check.id !== concordanceFailureCheck.id),
              ];

              return {
                ...current,
                formatChecks:
                  current.selectedSegmentId === segmentId ? nextChecks : current.formatChecks,
                segmentFormatChecks: {
                  ...current.segmentFormatChecks,
                  [segmentId]: nextChecks,
                },
              };
            });
          } finally {
            if (reviewSequenceRef.current === sequence) {
              setIsLoadingConcordance(false);
            }
          }
        }

        if (includeAi && generateAiRecommendation) {
          try {
            recommendation = await generateAiRecommendation(
              segment,
              segment.targetText,
              intelligenceForRecommendation,
            );
          } catch (error) {
            if (reviewSequenceRef.current !== sequence) {
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

        const [formatChecks, qaChecks] = await Promise.all([
          includeFormatChecks && validateFormat
            ? validateFormat(segment, segment.targetText)
            : Promise.resolve([]),
          includeFormatChecks && runQaChecks
            ? runQaChecks(segment, segment.targetText)
            : Promise.resolve([]),
        ]);
        if (reviewSequenceRef.current !== sequence) {
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

        setState((current) => {
          const currentIntelligence =
            current.segmentIntelligence?.[segmentId] ?? current.intelligence;

          return {
            ...current,
            formatChecks: current.selectedSegmentId === segmentId ? checks : current.formatChecks,
            segmentFormatChecks: {
              ...current.segmentFormatChecks,
              [segmentId]: checks,
            },
            segmentIntelligence: recommendation
              ? {
                  ...current.segmentIntelligence,
                  [segmentId]: {
                    ...currentIntelligence,
                    aiSuggestion: recommendation.aiSuggestion,
                    aiReasoning: recommendation.aiReasoning,
                  },
                }
              : current.segmentIntelligence,
          };
        });
      } finally {
        if (reviewSequenceRef.current === sequence) {
          if (includeAi) {
            setIsGeneratingAiRecommendation(false);
          }
          if (includeFormatChecks) {
            setIsRunningFormatChecks(false);
          }
        }
      }
    },
    [
      generateAiRecommendation,
      intl,
      lookupSegmentConcordance,
      onReviewWithAi,
      runQaChecks,
      validateFormat,
    ],
  );

  const runSegmentReviewRef = useRef(runSegmentReview);
  runSegmentReviewRef.current = runSegmentReview;

  useEffect(() => {
    const segmentId = state.selectedSegmentId;
    if (!segmentId || !canRunSegmentReview) {
      return;
    }

    void runSegmentReviewRef.current(segmentId, { includeAi: false });
  }, [state.selectedSegmentId, canRunSegmentReview]);

  const dependencies = useMemo<CatWorkspaceDependencies>(() => {
    const navigation = {
      onSelectSegment: (segmentId: string) => {
        setState((current) => {
          const selectedSegmentId = getSegmentId(current.segments, segmentId) ?? segmentId;
          return { ...current, selectedSegmentId };
        });
        onSelectSegment?.(segmentId);
      },
      onPreviousSegment: () => {
        setState((current) => {
          const previousId = getAdjacentSegmentId(current.segments, current.selectedSegmentId, -1);
          if (!previousId) {
            return current;
          }
          return { ...current, selectedSegmentId: previousId };
        });
        onPreviousSegment?.();
      },
      onNextSegment: () => {
        setState((current) => {
          const nextId = getAdjacentSegmentId(current.segments, current.selectedSegmentId, 1);
          if (!nextId) {
            return current;
          }
          return { ...current, selectedSegmentId: nextId };
        });
        onNextSegment?.();
      },
      onReviewInSequence: () => {
        onReviewInSequence?.();
      },
    };

    const editing = {
      onTargetChange: (segmentId: string, value: string) => {
        const segmentsToValidate = updateSegmentTarget(stateRef.current.segments, segmentId, value);
        const segmentToValidate = segmentsToValidate.find((item) => item.id === segmentId);
        setState((current) => {
          const segments = updateSegmentTarget(current.segments, segmentId, value);
          return { ...current, segments };
        });
        if (segmentToValidate) {
          void runSegmentChecks(segmentToValidate, value);
        }
        onTargetChange?.(segmentId, value);
      },
      onUseAiSuggestion: (segmentId: string) => {
        const aiSuggestion = getAiSuggestionForSegment(stateRef.current, segmentId);
        if (!aiSuggestion) {
          return;
        }
        editing.onTargetChange(segmentId, aiSuggestion);
        onUseAiSuggestion?.(segmentId);
      },
    };

    const review = {
      onApprove: async (segmentId: string, targetText: string) => {
        setIsApproving(true);
        try {
          const nextStatus = (await onApprove?.(segmentId, targetText)) ?? "reviewed";
          setState((current) => {
            const segments = updateSegmentTarget(
              updateSegmentStatus(current.segments, segmentId, nextStatus),
              segmentId,
              targetText,
            );
            const nextSelectedSegmentId =
              getAdjacentSegmentId(current.segments, segmentId, 1) ?? current.selectedSegmentId;
            return {
              ...current,
              segments,
              selectedSegmentId: nextSelectedSegmentId,
              queueSummary: {
                total: current.queueSummary.total,
                reviewed: countReviewed(segments),
              },
            };
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : intl.formatMessage(catWorkspaceContainerMessages.saveTranslationFailed);
          setState((current) => ({
            ...current,
            ...addSaveFailureFormatCheck(
              current,
              segmentId,
              message,
              intl.formatMessage(catWorkspaceContainerMessages.saveFailedLabel),
            ),
          }));
        } finally {
          setIsApproving(false);
        }
      },
      onAddComment: async (segmentId: string, text: string) => {
        if (!onAddComment) {
          return;
        }

        setCommentPostError(undefined);
        setIsPostingComment(true);
        try {
          await onAddComment(segmentId, text);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : intl.formatMessage(catEditorPanelMessages.commentPostFailed);
          setCommentPostError(message);
          throw error;
        } finally {
          setIsPostingComment(false);
        }
      },
      onAskQuestion: async (segmentId: string) => {
        await onAskQuestion?.(segmentId);
        if (!lookupSegmentContext) {
          return;
        }

        const segment = stateRef.current.segments.find((item) => item.id === segmentId);
        if (!segment) {
          return;
        }

        const existingAgentContext =
          stateRef.current.segmentIntelligence?.[segmentId]?.agentContext?.trim();
        setRevealedAgentContextSegmentIds((current) => new Set(current).add(segmentId));
        if (existingAgentContext) {
          return;
        }

        setIsLookingUpContext(true);
        try {
          const agentContext = await lookupSegmentContext(segment);
          setState((current) => {
            const currentIntelligence =
              current.segmentIntelligence?.[segmentId] ?? current.intelligence;
            const currentChecks = current.segmentFormatChecks?.[segmentId] ?? current.formatChecks;
            const nextChecks = currentChecks.filter(
              (check) => check.id !== `context-lookup-failed-${segmentId}`,
            );

            return {
              ...current,
              formatChecks:
                current.selectedSegmentId === segmentId ? nextChecks : current.formatChecks,
              segmentFormatChecks: {
                ...current.segmentFormatChecks,
                [segmentId]: nextChecks,
              },
              segmentIntelligence: {
                ...current.segmentIntelligence,
                [segmentId]: {
                  ...currentIntelligence,
                  agentContext,
                },
              },
            };
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : intl.formatMessage(catWorkspaceContainerMessages.contextLookupFailed);
          const lookupFailureCheck: CatFormatCheck = {
            id: `context-lookup-failed-${segmentId}`,
            label: intl.formatMessage(catWorkspaceContainerMessages.contextLookupLabel),
            status: "fail",
            message,
            category: "qa",
          };

          setState((current) => {
            const currentChecks = current.segmentFormatChecks?.[segmentId] ?? current.formatChecks;
            const nextChecks = [
              lookupFailureCheck,
              ...currentChecks.filter((check) => check.id !== lookupFailureCheck.id),
            ];

            return {
              ...current,
              formatChecks:
                current.selectedSegmentId === segmentId ? nextChecks : current.formatChecks,
              segmentFormatChecks: {
                ...current.segmentFormatChecks,
                [segmentId]: nextChecks,
              },
            };
          });
        } finally {
          setIsLookingUpContext(false);
        }
      },
      onReviewWithAi: async (segmentId: string) => {
        await runSegmentReview(segmentId, { includeAi: true });
      },
      onSkip: (segmentId: string) => {
        setState((current) => {
          const segments = updateSegmentStatus(current.segments, segmentId, "skipped");
          return { ...current, segments };
        });
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
    onApprove,
    onAddComment,
    onAskQuestion,
    intl,
    onNextSegment,
    onPreviousSegment,
    onReviewInSequence,
    onReviewWithAi,
    onSelectSegment,
    onSkip,
    onTargetChange,
    onUseAiSuggestion,
    lookupSegmentContext,
    runSegmentReview,
    runQaChecks,
    runSegmentChecks,
    validateFormat,
  ]);

  return (
    <CatWorkspaceView
      state={state}
      dependencies={dependencies}
      isValidating={isValidating}
      isApproving={isApproving}
      isPostingComment={isPostingComment}
      commentPostError={commentPostError}
      isLookingUpContext={isLookingUpContext}
      isConcordanceLoading={isLoadingConcordance}
      isAiSuggestionLoading={isGeneratingAiRecommendation && canUseAiRecommendation}
      isFormatChecksLoading={isRunningFormatChecks || isValidating}
      canLookupContext={canLookupContext}
      showAgentContext={revealedAgentContextSegmentIds.has(state.selectedSegmentId)}
      canUseAiRecommendation={canUseAiRecommendation}
      className={className}
      queueSearch={queueSearch}
      onQueueSearchChange={onQueueSearchChange}
      isQueueSearchPending={isQueueSearchPending}
      isQueueFetchingPage={isQueueFetchingPage}
      queuePagination={queuePagination}
      onQueuePreviousPage={onQueuePreviousPage}
      onQueueNextPage={onQueueNextPage}
      onQueueNearEnd={onQueueNearEnd}
    />
  );
}
