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
import type { CatSegment, CatWorkspaceState } from "./types";

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
  const stateRef = useRef(state);
  const validationSequenceRef = useRef(0);
  const validateFormat = serviceOverrides?.validateFormat;
  const runQaChecks = serviceOverrides?.runQaChecks;
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

  const runSegmentChecks = useCallback(
    async (segment: CatSegment, value: string) => {
      if (!validateFormat && !runQaChecks) {
        return;
      }

      const sequence = validationSequenceRef.current + 1;
      validationSequenceRef.current = sequence;
      const [formatChecks, qaChecks] = await Promise.all([
        validateFormat ? validateFormat(segment, value) : Promise.resolve([]),
        runQaChecks ? runQaChecks(segment, value) : Promise.resolve([]),
      ]);
      if (validationSequenceRef.current !== sequence) {
        return;
      }
      setState((current) => ({ ...current, formatChecks: [...formatChecks, ...qaChecks] }));
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
        const aiSuggestion = state.intelligence.aiSuggestion;
        if (!aiSuggestion) {
          return;
        }
        editing.onTargetChange(segmentId, aiSuggestion);
        onUseAiSuggestion?.(segmentId);
      },
    };

    const review = {
      onApprove: (segmentId: string) => {
        setState((current) => {
          const segments = updateSegmentStatus(current.segments, segmentId, "reviewed");
          return {
            ...current,
            segments,
            queueSummary: {
              total: current.queueSummary.total,
              reviewed: countReviewed(segments),
            },
          };
        });
        onApprove?.(segmentId);
      },
      onAskQuestion: (segmentId: string) => {
        onAskQuestion?.(segmentId);
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
    runQaChecks,
    runSegmentChecks,
    state.intelligence.aiSuggestion,
    validateFormat,
  ]);

  return <CatWorkspaceView state={state} dependencies={dependencies} className={className} />;
}
