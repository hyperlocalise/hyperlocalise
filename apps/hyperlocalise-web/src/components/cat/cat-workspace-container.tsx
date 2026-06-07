"use client";

import { useCallback, useMemo, useState } from "react";

import type { CatWorkspaceDependencies, PartialCatWorkspaceDependencies } from "./dependencies";
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
  className?: string;
}

export function CatWorkspaceContainer({
  initialState,
  dependencies: dependencyOverrides,
  className,
}: CatWorkspaceContainerProps) {
  const [state, setState] = useState(initialState);
  const [isBusy, setIsBusy] = useState(false);

  const runFormatValidation = useCallback(
    async (segment: CatSegment, value: string) => {
      const service = dependencyOverrides?.services?.validateFormat;
      if (!service) {
        return;
      }

      setIsBusy(true);
      try {
        const checks = await service(segment, value);
        setState((current) => ({ ...current, formatChecks: checks }));
      } finally {
        setIsBusy(false);
      }
    },
    [dependencyOverrides?.services],
  );

  const dependencies = useMemo<CatWorkspaceDependencies>(() => {
    const navigation = {
      onSelectSegment: (segmentId: string) => {
        setState((current) => ({ ...current, selectedSegmentId: segmentId }));
        dependencyOverrides?.navigation?.onSelectSegment?.(segmentId);
      },
      onPreviousSegment: () => {
        setState((current) => {
          const previousId = getAdjacentSegmentId(current.segments, current.selectedSegmentId, -1);
          if (!previousId) {
            return current;
          }
          dependencyOverrides?.navigation?.onPreviousSegment?.();
          return { ...current, selectedSegmentId: previousId };
        });
      },
      onNextSegment: () => {
        setState((current) => {
          const nextId = getAdjacentSegmentId(current.segments, current.selectedSegmentId, 1);
          if (!nextId) {
            return current;
          }
          dependencyOverrides?.navigation?.onNextSegment?.();
          return { ...current, selectedSegmentId: nextId };
        });
      },
      onReviewInSequence: () => {
        dependencyOverrides?.navigation?.onReviewInSequence?.();
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
        dependencyOverrides?.editing?.onTargetChange?.(segmentId, value);
      },
      onUseAiSuggestion: (segmentId: string) => {
        const aiSuggestion = state.intelligence.aiSuggestion;
        if (!aiSuggestion) {
          return;
        }
        editing.onTargetChange(segmentId, aiSuggestion);
        dependencyOverrides?.editing?.onUseAiSuggestion?.(segmentId);
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
              total: segments.length,
              reviewed: countReviewed(segments),
            },
          };
        });
        dependencyOverrides?.review?.onApprove?.(segmentId);
      },
      onAskQuestion: (segmentId: string) => {
        dependencyOverrides?.review?.onAskQuestion?.(segmentId);
      },
      onSkip: (segmentId: string) => {
        setState((current) => {
          const segments = updateSegmentStatus(current.segments, segmentId, "skipped");
          return { ...current, segments };
        });
        dependencyOverrides?.review?.onSkip?.(segmentId);
      },
    };

    return {
      navigation,
      editing,
      review,
      services: dependencyOverrides?.services,
    };
  }, [dependencyOverrides, runFormatValidation, state.intelligence.aiSuggestion]);

  return (
    <CatWorkspaceView
      state={state}
      dependencies={dependencies}
      isBusy={isBusy}
      className={className}
    />
  );
}
