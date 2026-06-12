"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CatWorkspaceDependencies,
  CatWorkspaceEditing,
  CatWorkspaceNavigation,
  CatWorkspaceReview,
  CatWorkspaceServices,
  PartialCatWorkspaceDependencies,
} from "./dependencies";
import { CatWorkspaceView } from "./cat-workspace";
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
): Pick<CatWorkspaceState, "formatChecks" | "segmentFormatChecks"> {
  const saveFailureCheck: CatFormatCheck = {
    id: `save-failed-${segmentId}`,
    label: "Save failed",
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
}

export function CatWorkspaceContainer({
  initialState,
  dependencies: dependencyOverrides,
  navigation: navigationOverrides = dependencyOverrides?.navigation,
  editing: editingOverrides = dependencyOverrides?.editing,
  review: reviewOverrides = dependencyOverrides?.review,
  services: serviceOverrides = dependencyOverrides?.services,
  className,
}: CatWorkspaceContainerProps) {
  const [state, setState] = useState(initialState);
  const [isValidating, setIsValidating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isLookingUpContext, setIsLookingUpContext] = useState(false);
  const stateRef = useRef(state);
  const previousInitialStateRef = useRef(initialState);
  const validationSequenceRef = useRef(0);
  const validateFormat = serviceOverrides?.validateFormat;
  const runQaChecks = serviceOverrides?.runQaChecks;
  const lookupSegmentContext = serviceOverrides?.lookupSegmentContext;
  const canLookupContext = Boolean(lookupSegmentContext);
  const onSelectSegment = navigationOverrides?.onSelectSegment;
  const onPreviousSegment = navigationOverrides?.onPreviousSegment;
  const onNextSegment = navigationOverrides?.onNextSegment;
  const onReviewInSequence = navigationOverrides?.onReviewInSequence;
  const onTargetChange = editingOverrides?.onTargetChange;
  const onUseAiSuggestion = editingOverrides?.onUseAiSuggestion;
  const onApprove = reviewOverrides?.onApprove;
  const onAskQuestion = reviewOverrides?.onAskQuestion;
  const onSkip = reviewOverrides?.onSkip;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setState((current) =>
      mergeCatWorkspaceState(previousInitialStateRef.current, current, initialState),
    );
    previousInitialStateRef.current = initialState;
  }, [initialState]);

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
            const segments = updateSegmentStatus(current.segments, segmentId, nextStatus);
            return {
              ...current,
              segments,
              queueSummary: {
                total: current.queueSummary.total,
                reviewed: countReviewed(segments),
              },
            };
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to save translation.";
          setState((current) => ({
            ...current,
            ...addSaveFailureFormatCheck(current, segmentId, message),
          }));
        } finally {
          setIsApproving(false);
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

        setIsLookingUpContext(true);
        try {
          const productMeaning = await lookupSegmentContext(segment);
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
                  productMeaning,
                },
              },
            };
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to look up repository context.";
          const lookupFailureCheck: CatFormatCheck = {
            id: `context-lookup-failed-${segmentId}`,
            label: "Context lookup",
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
    onAskQuestion,
    onNextSegment,
    onPreviousSegment,
    onReviewInSequence,
    onSelectSegment,
    onSkip,
    onTargetChange,
    onUseAiSuggestion,
    lookupSegmentContext,
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
      isLookingUpContext={isLookingUpContext}
      canLookupContext={canLookupContext}
      className={className}
    />
  );
}
