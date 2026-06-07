"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/primitives/cn";

import { CatEditorPanel } from "./cat-editor-panel";
import { CatIntelligencePanel } from "./cat-intelligence-panel";
import { CatQueuePanel } from "./cat-queue-panel";
import { CatWorkspaceHeader } from "./cat-workspace-header";
import type { CatWorkspaceViewProps } from "./dependencies";

export function CatWorkspaceView({
  state,
  dependencies,
  isBusy = false,
  externalLinkLabel,
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
  const { navigation, editing, review, toolbar } = dependencies;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <CatWorkspaceHeader
        breadcrumbs={state.breadcrumbs}
        externalLinkLabel={externalLinkLabel}
        onRefresh={toolbar?.onRefresh}
        onOpenExternal={toolbar?.onOpenExternal}
        onRunWithAgent={toolbar?.onRunWithAgent}
      />

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={22} minSize={16} maxSize={32}>
          <CatQueuePanel
            segments={state.segments}
            selectedSegmentId={selectedSegment.id}
            summary={state.queueSummary}
            onSelectSegment={navigation.onSelectSegment}
            onReviewInSequence={navigation.onReviewInSequence}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={48} minSize={36}>
          <CatEditorPanel
            segment={selectedSegment}
            segmentPosition={segmentPosition}
            totalSegments={state.segments.length}
            suggestions={state.suggestions}
            formatChecks={state.formatChecks}
            intelligence={state.intelligence}
            historyCount={state.historyCount}
            glossaryMatchCount={state.glossaryMatchCount}
            tmMatchBasisCount={state.tmMatchBasisCount}
            isBusy={isBusy}
            onTargetChange={(value) => editing.onTargetChange(selectedSegment.id, value)}
            onUseSuggestion={(suggestion) =>
              editing.onUseSuggestion(selectedSegment.id, suggestion)
            }
            onUseAiSuggestion={() => editing.onUseAiSuggestion(selectedSegment.id)}
            onApprove={() => review.onApprove(selectedSegment.id)}
            onRequestChanges={() => review.onRequestChanges(selectedSegment.id)}
            onAskQuestion={() => review.onAskQuestion(selectedSegment.id)}
            onSkip={() => review.onSkip(selectedSegment.id)}
            onPrevious={navigation.onPreviousSegment}
            onNext={navigation.onNextSegment}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={30} minSize={22} maxSize={40}>
          <CatIntelligencePanel intelligence={state.intelligence} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
