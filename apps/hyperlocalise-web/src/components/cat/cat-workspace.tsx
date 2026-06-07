"use client";

import { cn } from "@/lib/primitives/cn";

import { CatEditorPanel } from "./cat-editor-panel";
import { CatIntelligencePanel } from "./cat-intelligence-panel";
import { CatQueuePanel } from "./cat-queue-panel";
import type { CatWorkspaceViewProps } from "./dependencies";

export function CatWorkspaceView({
  state,
  dependencies,
  isBusy = false,
  className,
}: CatWorkspaceViewProps) {
  const selectedSegment =
    state.segments.find((segment) => segment.id === state.selectedSegmentId) ?? state.segments[0];

  if (!selectedSegment) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        No segments in queue.
      </div>
    );
  }

  const segmentPosition = selectedSegment.index;
  const { navigation, editing, review } = dependencies;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[20rem_minmax(0,1fr)_22rem] overflow-hidden">
        <div className="min-w-0 overflow-hidden">
          <CatQueuePanel
            segments={state.segments}
            selectedSegmentId={selectedSegment.id}
            summary={state.queueSummary}
            onSelectSegment={navigation.onSelectSegment}
            onReviewInSequence={navigation.onReviewInSequence}
          />
        </div>

        <div className="min-w-0 overflow-hidden">
          <CatEditorPanel
            segment={selectedSegment}
            segmentPosition={segmentPosition}
            totalSegments={state.segments.length}
            formatChecks={state.formatChecks}
            intelligence={state.intelligence}
            isBusy={isBusy}
            onTargetChange={(value) => editing.onTargetChange(selectedSegment.id, value)}
            onUseAiSuggestion={() => editing.onUseAiSuggestion(selectedSegment.id)}
            onApprove={() => review.onApprove(selectedSegment.id)}
            onAskQuestion={() => review.onAskQuestion(selectedSegment.id)}
            onSkip={() => review.onSkip(selectedSegment.id)}
            onPrevious={navigation.onPreviousSegment}
            onNext={navigation.onNextSegment}
          />
        </div>

        <div className="min-w-0 overflow-hidden">
          <CatIntelligencePanel intelligence={state.intelligence} />
        </div>
      </div>
    </div>
  );
}
