"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
import {
  buildSavedTargetTextMap,
  collectDirtySegmentIds,
  isSegmentTargetDirty,
  markSegmentTargetSaved,
  syncSavedTargetTexts,
  type SavedTargetTextMap,
} from "./cat-dirty-state";
import { adjustQueueSummaryForStatusChange, applyGlossaryTermToTarget } from "./cat-queue-summary";
import {
  findSegmentIdByKeyOrId,
  resolveSelectedSegmentId,
  resolveVisibleQueueSegments,
  type CatQueueFilter,
} from "./cat-queue-filter";
import { buildCatSegmentShareUrl } from "./cat-segment-share-link";
import {
  catEditorPanelMessages,
  catIntelligencePanelMessages,
  catWorkspaceContainerMessages,
} from "./cat.messages";
import {
  selectBestTmMatchForAutoFill,
  TM_AUTO_FILL_MIN_MATCH_PERCENT_DEFAULT,
} from "./tm-match-quality";
import type {
  CatFormatCheck,
  CatGlossaryTerm,
  CatSegment,
  CatTranslationMemoryMatch,
  CatWorkspaceState,
} from "./types";

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

    const nextVisualContext = nextInitialState.segmentIntelligence?.[segment.id]?.visualContext;
    const currentVisualContext = currentState.segmentIntelligence?.[segment.id]?.visualContext;
    if (!nextVisualContext && currentVisualContext) {
      segmentIntelligence[segment.id] = {
        ...(segmentIntelligence[segment.id] ?? nextInitialState.intelligence),
        ...currentState.segmentIntelligence?.[segment.id],
        visualContext: currentVisualContext,
      };
    }
  }

  return {
    ...nextInitialState,
    segments,
    selectedSegmentId,
    queueSummary: nextInitialState.queueSummary,
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
  queueFilter?: CatQueueFilter;
  onQueueFilterChange?: (filter: CatQueueFilter) => void;
  availableQueueFilters?: CatQueueFilter[];
  isQueueSearchPending?: boolean;
  isQueueFetchingPage?: boolean;
  queuePagination?: CatWorkspaceViewProps["queuePagination"];
  onQueuePreviousPage?: () => void;
  onQueueNextPage?: () => void;
  onQueueNearEnd?: () => void;
  initialSegmentKeyOrId?: string | null;
  buildSegmentShareUrl?: (segment: CatSegment) => string | null;
  tmAutoFillMinMatchPercent?: number;
}

type UnsavedNavigationPrompt = {
  kind: "segment" | "page";
  proceed: () => void;
};

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
  queueFilter: queueFilterProp,
  onQueueFilterChange,
  availableQueueFilters,
  isQueueSearchPending,
  isQueueFetchingPage,
  queuePagination,
  onQueuePreviousPage,
  onQueueNextPage,
  onQueueNearEnd,
  initialSegmentKeyOrId,
  buildSegmentShareUrl,
  tmAutoFillMinMatchPercent = TM_AUTO_FILL_MIN_MATCH_PERCENT_DEFAULT,
}: CatWorkspaceContainerProps) {
  const intl = useIntl();
  const [state, setState] = useState(() => ({
    ...initialState,
    selectedSegmentId: resolveSelectedSegmentId(
      initialState.segments,
      initialSegmentKeyOrId,
      initialState.selectedSegmentId,
    ),
  }));
  const [localQueueFilter, setLocalQueueFilter] = useState<CatQueueFilter>("all");
  const queueFilter = queueFilterProp ?? localQueueFilter;
  const handleQueueFilterChange = onQueueFilterChange ?? setLocalQueueFilter;
  const [checkedSegmentIds, setCheckedSegmentIds] = useState<ReadonlySet<string>>(() => new Set());
  const [isBulkActionPending, setIsBulkActionPending] = useState(false);
  const initialSegmentJumpAppliedRef = useRef(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentPostError, setCommentPostError] = useState<string | undefined>();
  const [isLookingUpContext, setIsLookingUpContext] = useState(false);
  const [isLoadingConcordance, setIsLoadingConcordance] = useState(false);
  const [isLoadingVisualContext, setIsLoadingVisualContext] = useState(false);
  const [revealedAgentContextSegmentIds, setRevealedAgentContextSegmentIds] = useState<
    ReadonlySet<string>
  >(() => collectSegmentsWithAgentContext(initialState));
  const [isGeneratingAiRecommendation, setIsGeneratingAiRecommendation] = useState(false);
  const [isRunningFormatChecks, setIsRunningFormatChecks] = useState(false);
  const [savedTargetTexts, setSavedTargetTexts] = useState<SavedTargetTextMap>(() =>
    buildSavedTargetTextMap(initialState.segments),
  );
  const [unsavedNavigationPrompt, setUnsavedNavigationPrompt] =
    useState<UnsavedNavigationPrompt | null>(null);
  const stateRef = useRef(state);
  const previousInitialStateRef = useRef(initialState);
  const validationSequenceRef = useRef(0);
  const reviewSequenceRef = useRef(0);
  const autoFilledSegmentIdsRef = useRef<ReadonlySet<string>>(new Set());
  const savedTargetTextsRef = useRef(savedTargetTexts);
  savedTargetTextsRef.current = savedTargetTexts;
  const validateFormat = serviceOverrides?.validateFormat;
  const runQaChecks = serviceOverrides?.runQaChecks;
  const lookupSegmentContext = serviceOverrides?.lookupSegmentContext;
  const lookupSegmentConcordance = serviceOverrides?.lookupSegmentConcordance;
  const lookupSegmentVisualContext = serviceOverrides?.lookupSegmentVisualContext;
  const generateAiRecommendation = serviceOverrides?.generateAiRecommendation;
  const canLookupContext = Boolean(lookupSegmentContext);
  const canLoadVisualContext = Boolean(
    lookupSegmentVisualContext && state.providerKind && state.providerKind !== "native",
  );
  const canUseAiRecommendation = Boolean(generateAiRecommendation);
  const canRunSegmentReview = Boolean(
    lookupSegmentConcordance || generateAiRecommendation || validateFormat || runQaChecks,
  );
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
  const onBulkApprove = reviewOverrides?.onBulkApprove;
  const onBulkSkip = reviewOverrides?.onBulkSkip;

  const usesServerQueueFilter = Boolean(onQueueFilterChange);

  const filteredSegments = useMemo(
    () => resolveVisibleQueueSegments(state.segments, queueFilter, usesServerQueueFilter),
    [queueFilter, state.segments, usesServerQueueFilter],
  );

  useEffect(() => {
    setState((current) => {
      if (filteredSegments.some((segment) => segment.id === current.selectedSegmentId)) {
        return current;
      }

      const nextSelectedSegmentId = filteredSegments[0]?.id;
      if (!nextSelectedSegmentId || nextSelectedSegmentId === current.selectedSegmentId) {
        return current;
      }

      return { ...current, selectedSegmentId: nextSelectedSegmentId };
    });
  }, [filteredSegments]);

  useEffect(() => {
    setCheckedSegmentIds(new Set());
  }, [queueFilter]);

  useEffect(() => {
    setCheckedSegmentIds((current) => {
      const visibleIds = new Set(state.segments.map((segment) => segment.id));
      const next = new Set([...current].filter((segmentId) => visibleIds.has(segmentId)));
      return next.size === current.size ? current : next;
    });
  }, [state.segments]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setState((current) => {
      const merged = mergeCatWorkspaceState(previousInitialStateRef.current, current, initialState);
      const matchedSegmentId = initialSegmentKeyOrId
        ? findSegmentIdByKeyOrId(merged.segments, initialSegmentKeyOrId)
        : null;
      if (matchedSegmentId && !initialSegmentJumpAppliedRef.current) {
        initialSegmentJumpAppliedRef.current = true;
        return {
          ...merged,
          selectedSegmentId: matchedSegmentId,
        };
      }

      return merged;
    });
    setSavedTargetTexts((saved) =>
      syncSavedTargetTexts({
        savedTargetTexts: saved,
        previousInitialState: previousInitialStateRef.current,
        currentState: stateRef.current,
        nextInitialState: initialState,
      }),
    );
    previousInitialStateRef.current = initialState;
    setRevealedAgentContextSegmentIds((current) => {
      const next = collectSegmentsWithAgentContext(initialState);
      return new Set([...current, ...next]);
    });
  }, [initialSegmentKeyOrId, initialState]);

  useEffect(() => {
    const dirtySegmentIds = collectDirtySegmentIds(state.segments, savedTargetTexts);
    if (dirtySegmentIds.length === 0) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [savedTargetTexts, state.segments]);

  const attemptSegmentNavigation = useCallback((proceed: () => void) => {
    const currentState = stateRef.current;
    const selectedSegment = currentState.segments.find(
      (segment) => segment.id === currentState.selectedSegmentId,
    );
    if (
      selectedSegment &&
      isSegmentTargetDirty(
        selectedSegment.id,
        selectedSegment.targetText,
        savedTargetTextsRef.current,
      )
    ) {
      setUnsavedNavigationPrompt({ kind: "segment", proceed });
      return;
    }

    proceed();
  }, []);

  const attemptPageNavigation = useCallback((proceed: () => void) => {
    const dirtySegmentIds = collectDirtySegmentIds(
      stateRef.current.segments,
      savedTargetTextsRef.current,
    );
    if (dirtySegmentIds.length > 0) {
      setUnsavedNavigationPrompt({ kind: "page", proceed });
      return;
    }

    proceed();
  }, []);

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
      const includeConcordance = Boolean(lookupSegmentConcordance);

      if (!includeAi && !includeFormatChecks && !includeConcordance) {
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

            const currentSegment = stateRef.current.segments.find((item) => item.id === segmentId);
            const bestTmMatch = selectBestTmMatchForAutoFill(
              concordance.translationMemoryMatches,
              tmAutoFillMinMatchPercent,
            );
            if (
              currentSegment &&
              !currentSegment.targetText.trim() &&
              bestTmMatch &&
              !autoFilledSegmentIdsRef.current.has(segmentId)
            ) {
              autoFilledSegmentIdsRef.current = new Set([
                ...autoFilledSegmentIdsRef.current,
                segmentId,
              ]);
              const segments = updateSegmentTarget(
                stateRef.current.segments,
                segmentId,
                bestTmMatch.targetText,
              );
              setState((current) => ({ ...current, segments }));
              setSavedTargetTexts((saved) =>
                markSegmentTargetSaved(saved, segmentId, bestTmMatch.targetText),
              );
              onTargetChange?.(segmentId, bestTmMatch.targetText);
              const updatedSegment = segments.find((item) => item.id === segmentId);
              if (updatedSegment && (validateFormat || runQaChecks)) {
                void runSegmentChecks(updatedSegment, bestTmMatch.targetText);
              }
            }
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

        if (includeFormatChecks || includeAi) {
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
        }
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
      onTargetChange,
      runQaChecks,
      runSegmentChecks,
      tmAutoFillMinMatchPercent,
      validateFormat,
    ],
  );

  const runSegmentReviewRef = useRef(runSegmentReview);
  runSegmentReviewRef.current = runSegmentReview;

  useEffect(() => {
    const segmentId = state.selectedSegmentId;
    if (!segmentId || !lookupSegmentVisualContext || !canLoadVisualContext) {
      return;
    }

    const segment = stateRef.current.segments.find((item) => item.id === segmentId);
    if (!segment) {
      return;
    }

    const existingVisualContext = stateRef.current.segmentIntelligence?.[segmentId]?.visualContext;
    if (existingVisualContext) {
      setIsLoadingVisualContext(false);
      return;
    }

    let cancelled = false;
    setIsLoadingVisualContext(true);

    void lookupSegmentVisualContext(segment)
      .then((visualContext) => {
        if (cancelled) {
          return;
        }

        setState((current) => {
          const segmentIntelligence =
            current.segmentIntelligence?.[segmentId] ?? current.intelligence;

          return {
            ...current,
            segmentIntelligence: {
              ...current.segmentIntelligence,
              [segmentId]: {
                ...segmentIntelligence,
                visualContext,
              },
            },
          };
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        const message = intl.formatMessage(catWorkspaceContainerMessages.visualContextLoadFailed);
        const visualContextFailureCheck: CatFormatCheck = {
          id: `visual-context-failed-${segmentId}`,
          label: intl.formatMessage(catIntelligencePanelMessages.panelTitle),
          status: "warn",
          message,
          category: "qa",
        };

        setState((current) => {
          const currentChecks =
            current.segmentFormatChecks?.[segmentId] ?? current.formatChecks ?? [];
          const nextChecks = [
            visualContextFailureCheck,
            ...currentChecks.filter((check) => check.id !== visualContextFailureCheck.id),
          ];

          return {
            ...current,
            segmentFormatChecks: {
              ...current.segmentFormatChecks,
              [segmentId]: nextChecks,
            },
            formatChecks:
              current.selectedSegmentId === segmentId ? nextChecks : current.formatChecks,
          };
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingVisualContext(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    canLoadVisualContext,
    intl,
    lookupSegmentVisualContext,
    state.providerKind,
    state.selectedSegmentId,
  ]);

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
        attemptSegmentNavigation(() => {
          setState((current) => {
            const selectedSegmentId = getSegmentId(current.segments, segmentId) ?? segmentId;
            return { ...current, selectedSegmentId };
          });
          onSelectSegment?.(segmentId);
        });
      },
      onPreviousSegment: () => {
        attemptSegmentNavigation(() => {
          setState((current) => {
            const visibleSegments = resolveVisibleQueueSegments(
              current.segments,
              queueFilter,
              usesServerQueueFilter,
            );
            const previousId = getAdjacentSegmentId(visibleSegments, current.selectedSegmentId, -1);
            if (!previousId) {
              return current;
            }
            return { ...current, selectedSegmentId: previousId };
          });
          onPreviousSegment?.();
        });
      },
      onNextSegment: () => {
        attemptSegmentNavigation(() => {
          setState((current) => {
            const visibleSegments = resolveVisibleQueueSegments(
              current.segments,
              queueFilter,
              usesServerQueueFilter,
            );
            const nextId = getAdjacentSegmentId(visibleSegments, current.selectedSegmentId, 1);
            if (!nextId) {
              return current;
            }
            return { ...current, selectedSegmentId: nextId };
          });
          onNextSegment?.();
        });
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
      onUseTmMatch: (segmentId: string, match: CatTranslationMemoryMatch) => {
        editing.onTargetChange(segmentId, match.targetText);
      },
      onUseGlossaryTerm: (segmentId: string, term: CatGlossaryTerm, sourceText: string) => {
        const segment = stateRef.current.segments.find((item) => item.id === segmentId);
        const currentTarget = segment?.targetText ?? "";
        editing.onTargetChange(
          segmentId,
          applyGlossaryTermToTarget(sourceText, currentTarget, term),
        );
      },
    };

    const review = {
      onApprove: async (segmentId: string, targetText: string) => {
        setIsApproving(true);
        try {
          const nextStatus = (await onApprove?.(segmentId, targetText)) ?? "reviewed";
          setState((current) => {
            const previousSegment = current.segments.find((segment) => segment.id === segmentId);
            const segments = updateSegmentTarget(
              updateSegmentStatus(current.segments, segmentId, nextStatus),
              segmentId,
              targetText,
            );
            const visibleSegments = resolveVisibleQueueSegments(
              segments,
              queueFilter,
              usesServerQueueFilter,
            );
            const nextSelectedSegmentId =
              getAdjacentSegmentId(visibleSegments, segmentId, 1) ?? current.selectedSegmentId;
            return {
              ...current,
              segments,
              selectedSegmentId: nextSelectedSegmentId,
              queueSummary: previousSegment
                ? adjustQueueSummaryForStatusChange(
                    current.queueSummary,
                    previousSegment.status,
                    nextStatus,
                  )
                : current.queueSummary,
            };
          });
          setSavedTargetTexts((saved) => markSegmentTargetSaved(saved, segmentId, targetText));
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
    attemptPageNavigation,
    attemptSegmentNavigation,
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
    queueFilter,
    usesServerQueueFilter,
    runSegmentReview,
    runQaChecks,
    runSegmentChecks,
    validateFormat,
  ]);

  const dirtySegmentIds = useMemo(
    () => new Set(collectDirtySegmentIds(state.segments, savedTargetTexts)),
    [savedTargetTexts, state.segments],
  );

  const handleToggleSegmentChecked = useCallback((segmentId: string, checked: boolean) => {
    setCheckedSegmentIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(segmentId);
      } else {
        next.delete(segmentId);
      }
      return next;
    });
  }, []);

  const handleSelectAllVisible = useCallback(() => {
    setCheckedSegmentIds(new Set(filteredSegments.map((segment) => segment.id)));
  }, [filteredSegments]);

  const handleClearChecked = useCallback(() => {
    setCheckedSegmentIds(new Set());
  }, []);

  const handleBulkApprove = useCallback(async () => {
    const segmentIds = [...checkedSegmentIds];
    if (segmentIds.length === 0) {
      return;
    }

    setIsBulkActionPending(true);
    try {
      if (onBulkApprove) {
        await onBulkApprove(segmentIds);
        setCheckedSegmentIds(new Set());
        return;
      }

      for (const segmentId of segmentIds) {
        const segment = stateRef.current.segments.find((item) => item.id === segmentId);
        if (!segment) {
          continue;
        }

        await dependencies.review.onApprove(segmentId, segment.targetText);
      }
    } finally {
      setIsBulkActionPending(false);
      setCheckedSegmentIds(new Set());
    }
  }, [checkedSegmentIds, dependencies.review, onBulkApprove]);

  const handleBulkSkip = useCallback(async () => {
    const segmentIds = [...checkedSegmentIds];
    if (segmentIds.length === 0) {
      return;
    }

    setIsBulkActionPending(true);
    try {
      if (onBulkSkip) {
        await onBulkSkip(segmentIds);
        return;
      }

      for (const segmentId of segmentIds) {
        dependencies.review.onSkip(segmentId);
      }
    } finally {
      setIsBulkActionPending(false);
      setCheckedSegmentIds(new Set());
    }
  }, [checkedSegmentIds, dependencies.review, onBulkSkip]);

  const queueViewState = useMemo(
    () => ({
      ...state,
      segments: filteredSegments,
    }),
    [filteredSegments, state],
  );

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

  return (
    <>
      <CatWorkspaceView
        state={queueViewState}
        editorState={state}
        dependencies={dependencies}
        dirtySegmentIds={dirtySegmentIds}
        isValidating={isValidating}
        isApproving={isApproving}
        isPostingComment={isPostingComment}
        commentPostError={commentPostError}
        isLookingUpContext={isLookingUpContext}
        isConcordanceLoading={isLoadingConcordance}
        isVisualContextLoading={isLoadingVisualContext}
        isAiSuggestionLoading={isGeneratingAiRecommendation && canUseAiRecommendation}
        isFormatChecksLoading={isRunningFormatChecks || isValidating}
        canLookupContext={canLookupContext}
        showAgentContext={revealedAgentContextSegmentIds.has(state.selectedSegmentId)}
        showVisualContext={canLoadVisualContext}
        canUseAiRecommendation={canUseAiRecommendation}
        className={className}
        queueSearch={queueSearch}
        onQueueSearchChange={onQueueSearchChange}
        isQueueSearchPending={isQueueSearchPending}
        isQueueFetchingPage={isQueueFetchingPage}
        queuePagination={queuePagination}
        onQueuePreviousPage={
          onQueuePreviousPage ? () => attemptPageNavigation(onQueuePreviousPage) : undefined
        }
        onQueueNextPage={onQueueNextPage ? () => attemptPageNavigation(onQueueNextPage) : undefined}
        onQueueNearEnd={onQueueNearEnd}
        queueFilter={queueFilter}
        onQueueFilterChange={handleQueueFilterChange}
        availableQueueFilters={availableQueueFilters}
        checkedSegmentIds={checkedSegmentIds}
        onToggleSegmentChecked={handleToggleSegmentChecked}
        onSelectAllVisible={handleSelectAllVisible}
        onClearChecked={handleClearChecked}
        onBulkApprove={() => void handleBulkApprove()}
        onBulkSkip={() => void handleBulkSkip()}
        isBulkActionPending={isBulkActionPending}
        buildSegmentShareUrl={resolvedBuildSegmentShareUrl}
      />

      <AlertDialog
        open={unsavedNavigationPrompt !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnsavedNavigationPrompt(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {unsavedNavigationPrompt?.kind === "page" ? (
                <FormattedMessage {...catWorkspaceContainerMessages.unsavedPageNavigationTitle} />
              ) : (
                <FormattedMessage
                  {...catWorkspaceContainerMessages.unsavedSegmentNavigationTitle}
                />
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {unsavedNavigationPrompt?.kind === "page" ? (
                <FormattedMessage
                  {...catWorkspaceContainerMessages.unsavedPageNavigationDescription}
                />
              ) : (
                <FormattedMessage
                  {...catWorkspaceContainerMessages.unsavedSegmentNavigationDescription}
                />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...catWorkspaceContainerMessages.unsavedNavigationStay} />
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const proceed = unsavedNavigationPrompt?.proceed;
                setUnsavedNavigationPrompt(null);
                proceed?.();
              }}
            >
              <FormattedMessage {...catWorkspaceContainerMessages.unsavedNavigationDiscard} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
