"use client";

import { useCallback, useMemo, useRef, useState } from "react";

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

function getAdjacentSegmentId(segments: CatSegment[], currentId: string, direction: -1 | 1) {
  const currentIndex = segments.findIndex((segment) => segment.id === currentId);
  if (currentIndex < 0) {
    return segments[0]?.id;
  }

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= segments.length) {
    return segments[currentIndex]?.id;
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
  const [isBusy, setIsBusy] = useState(false);
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

  const runFormatValidation = useCallback(
    async (segment: CatSegment, value: string) => {
      if (!validateFormat) {
        return;
      }

      const sequence = validationSequenceRef.current + 1;
      validationSequenceRef.current = sequence;
      setIsBusy(true);
      try {
        const checks = await validateFormat(segment, value);
        if (validationSequenceRef.current !== sequence) {
          return;
        }
        setState((current) => ({ ...current, formatChecks: checks }));
      } finally {
        if (validationSequenceRef.current === sequence) {
          setIsBusy(false);
        }
      }
    },
    [validateFormat],
  );

  const dependencies = useMemo<CatWorkspaceDependencies>(() => {
    const navigation = {
      onSelectSegment: (segmentId: string) => {
        setState((current) => ({ ...current, selectedSegmentId: segmentId }));
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
        setState((current) => {
          const segments = updateSegmentTarget(current.segments, segmentId, value);
          const segment = segments.find((item) => item.id === segmentId);
          if (segment) {
            void runFormatValidation(segment, value);
          }
          return { ...current, segments };
        });
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
    runFormatValidation,
    state.intelligence.aiSuggestion,
    validateFormat,
  ]);

  return (
    <CatWorkspaceView
      state={state}
      dependencies={dependencies}
      isBusy={isBusy}
      className={className}
    />
  );
}
