"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useNearEndPagination } from "../project-file/content-editor-near-end-pagination";
import { useEditorPageWindow } from "../project-file/content-editor-page-window";
import { useVirtualizer } from "@tanstack/react-virtual";
import { observer } from "mobx-react-lite";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ContentEditorSegmentCheckHandler } from "@/components/content-editor/segment/content-editor-segment-checkbox";
import { isContentEditorImageGenerating } from "@/components/content-editor/project-file/content-editor-image-generation-state";
import { cn } from "@/lib/primitives/cn";
import { ContentEditorSectionErrorBoundary } from "@/components/content-editor/workspace/content-editor-section-error-boundary";

import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";

import { ContentEditorSideBySideRow } from "./content-editor-side-by-side-row";
import { partitionSideBySideVirtualItems } from "./content-editor-side-by-side-visible-range";

const ESTIMATED_ROW_HEIGHT = 72;
const NO_FORMAT_CHECKS: ContentEditorFormatCheck[] = [];

type SideBySideRowActionProps = {
  onFocusSegment?: (segmentId: string) => void;
  onTargetChange?: (segmentId: string, value: string) => void;
  onApprove?: (segmentId: string) => void;
  onSaveDraft?: (segmentId: string) => void;
  onAddToIssueSheet?: (segmentId: string) => void;
  onUseAiSuggestion?: (segmentId: string) => void;
  onExplainGuideline?: (segmentId: string, check: ContentEditorFormatCheck) => void;
  onGenerateAiRecommendation?: (segmentId: string) => void;
  onTreatAsImage?: (segmentId: string, treatAsImage: boolean) => void;
  onTreatAsVideo?: (segmentId: string, treatAsVideo: boolean) => void;
  onRegenerateImage?: (segmentId: string) => void;
  onUploadImage?: (segmentId: string, file: File) => void;
  onToggleLocked?: (segmentId: string) => void | Promise<void>;
  onToggleSegmentChecked?: ContentEditorSegmentCheckHandler;
};

type SideBySideRowActions = ReturnType<typeof createSideBySideRowActions>;

/** Handlers with a stable identity that always call the latest props. */
function createSideBySideRowActions(latest: { readonly current: SideBySideRowActionProps }) {
  return {
    focus: (segmentId: string) => latest.current.onFocusSegment?.(segmentId),
    targetChange: (segmentId: string, value: string) =>
      latest.current.onTargetChange?.(segmentId, value),
    approve: (segmentId: string) => latest.current.onApprove?.(segmentId),
    saveDraft: (segmentId: string) => latest.current.onSaveDraft?.(segmentId),
    addToIssueSheet: (segmentId: string) => latest.current.onAddToIssueSheet?.(segmentId),
    applyAiSuggestion: (segmentId: string) => latest.current.onUseAiSuggestion?.(segmentId),
    explainGuideline: (segmentId: string, check: ContentEditorFormatCheck) =>
      latest.current.onExplainGuideline?.(segmentId, check),
    generateAiRecommendation: (segmentId: string) =>
      latest.current.onGenerateAiRecommendation?.(segmentId),
    treatAsImage: (segmentId: string, treatAsImage: boolean) =>
      latest.current.onTreatAsImage?.(segmentId, treatAsImage),
    treatAsVideo: (segmentId: string, treatAsVideo: boolean) =>
      latest.current.onTreatAsVideo?.(segmentId, treatAsVideo),
    regenerateImage: (segmentId: string) => latest.current.onRegenerateImage?.(segmentId),
    uploadImage: (segmentId: string, file: File) => latest.current.onUploadImage?.(segmentId, file),
    toggleLocked: (segmentId: string) => latest.current.onToggleLocked?.(segmentId),
    toggleChecked: (segmentId: string, checked: boolean, extendRange: boolean) =>
      latest.current.onToggleSegmentChecked?.(segmentId, checked, extendRange),
  };
}

type SideBySideAvailableActions = {
  approve: boolean;
  saveDraft: boolean;
  addToIssueSheet: boolean;
  applyAiSuggestion: boolean;
  explainGuideline: boolean;
  generateAiRecommendation: boolean;
  treatAsImage: boolean;
  treatAsVideo: boolean;
  regenerateImage: boolean;
  uploadImage: boolean;
  toggleLocked: boolean;
};

/** Which optional actions the row offers. Changes only when a handler appears or goes away. */
function useAvailableRowActions(
  handlers: Omit<
    SideBySideRowActionProps,
    "onFocusSegment" | "onTargetChange" | "onToggleSegmentChecked"
  >,
): SideBySideAvailableActions {
  const approve = Boolean(handlers.onApprove);
  const saveDraft = Boolean(handlers.onSaveDraft);
  const addToIssueSheet = Boolean(handlers.onAddToIssueSheet);
  const applyAiSuggestion = Boolean(handlers.onUseAiSuggestion);
  const explainGuideline = Boolean(handlers.onExplainGuideline);
  const generateAiRecommendation = Boolean(handlers.onGenerateAiRecommendation);
  const treatAsImage = Boolean(handlers.onTreatAsImage);
  const treatAsVideo = Boolean(handlers.onTreatAsVideo);
  const regenerateImage = Boolean(handlers.onRegenerateImage);
  const uploadImage = Boolean(handlers.onUploadImage);
  const toggleLocked = Boolean(handlers.onToggleLocked);
  return useMemo(
    () => ({
      approve,
      saveDraft,
      addToIssueSheet,
      applyAiSuggestion,
      explainGuideline,
      generateAiRecommendation,
      treatAsImage,
      treatAsVideo,
      regenerateImage,
      uploadImage,
      toggleLocked,
    }),
    [
      approve,
      saveDraft,
      addToIssueSheet,
      applyAiSuggestion,
      explainGuideline,
      generateAiRecommendation,
      treatAsImage,
      treatAsVideo,
      regenerateImage,
      uploadImage,
      toggleLocked,
    ],
  );
}

type SideBySideVirtualRowProps = Omit<
  ComponentProps<typeof ContentEditorSideBySideRow>,
  | "onFocus"
  | "onTargetChange"
  | "onApprove"
  | "onSaveDraft"
  | "onAddToIssueSheet"
  | "onUseAiSuggestion"
  | "onExplainGuideline"
  | "onGenerateAiRecommendation"
  | "onTreatAsImage"
  | "onTreatAsVideo"
  | "onRegenerateImage"
  | "onUploadImage"
  | "onToggleLocked"
  | "onCheckedChange"
> & {
  selectable: boolean;
  actions: SideBySideRowActions;
  available: SideBySideAvailableActions;
};

/**
 * One row of the list. An observer is memoised on its props (all stable between
 * renders unless this row changed), so the list re-renders only the rows whose
 * state moved. Typing re-renders just the row being typed in.
 */
const SideBySideVirtualRow = observer(function SideBySideVirtualRow({
  selectable,
  actions,
  available,
  ...rowProps
}: SideBySideVirtualRowProps) {
  const id = rowProps.segment.id;
  return (
    <ContentEditorSectionErrorBoundary
      section="sideBySide.row"
      className="mx-4 my-2"
      resetKeys={[id, rowProps.segment.targetText]}
    >
      <ContentEditorSideBySideRow
        {...rowProps}
        onFocus={() => actions.focus(id)}
        onTargetChange={(value) => actions.targetChange(id, value)}
        onApprove={available.approve ? () => actions.approve(id) : undefined}
        onSaveDraft={available.saveDraft ? () => actions.saveDraft(id) : undefined}
        onAddToIssueSheet={
          available.addToIssueSheet ? () => actions.addToIssueSheet(id) : undefined
        }
        onUseAiSuggestion={
          available.applyAiSuggestion ? () => actions.applyAiSuggestion(id) : undefined
        }
        onExplainGuideline={
          available.explainGuideline ? (check) => actions.explainGuideline(id, check) : undefined
        }
        onGenerateAiRecommendation={
          available.generateAiRecommendation
            ? () => actions.generateAiRecommendation(id)
            : undefined
        }
        onTreatAsImage={
          available.treatAsImage
            ? (treatAsImage) => actions.treatAsImage(id, treatAsImage)
            : undefined
        }
        onTreatAsVideo={
          available.treatAsVideo
            ? (treatAsVideo) => actions.treatAsVideo(id, treatAsVideo)
            : undefined
        }
        onRegenerateImage={
          available.regenerateImage ? () => actions.regenerateImage(id) : undefined
        }
        onUploadImage={available.uploadImage ? (file) => actions.uploadImage(id, file) : undefined}
        onToggleLocked={available.toggleLocked ? () => actions.toggleLocked(id) : undefined}
        onCheckedChange={
          selectable
            ? (checked, extendRange) => actions.toggleChecked(id, checked, extendRange)
            : undefined
        }
      />
    </ContentEditorSectionErrorBoundary>
  );
});

export function ContentEditorSideBySideVirtualList({
  segments,
  focusedSegmentId,
  dirtySegmentIds,
  canEdit,
  loadingSegmentIds,
  isApproving = false,
  isSavingDraft = false,
  isPostingComment = false,
  isLookingUpContext = false,
  isAiSuggestionLoading = false,
  isFormatChecksLoading = false,
  isImageBusy = false,
  isImageGenerating = false,
  generatingImageSegmentId,
  canUseAiRecommendation = false,
  focusedIntelligence = null,
  aiRecommendationError,
  aiRecommendationCreditExhausted = false,
  formatChecks = [],
  segmentFormatChecks,
  formatCheckLoadingSegmentIds,
  primaryActionLabel,
  segmentShareUrl = null,
  onFocusSegment,
  onVisibleRangeChange,
  onTargetChange,
  onApprove,
  onSaveDraft,
  onAddToIssueSheet,
  onUseAiSuggestion,
  onExplainGuideline,
  explainingGuidelineCheckId = null,
  onGenerateAiRecommendation,
  onTreatAsImage,
  onTreatAsVideo,
  onRegenerateImage,
  onUploadImage,
  onToggleLocked,
  checkedSegmentIds,
  showSelection = false,
  onToggleSegmentChecked,
  hasMore = false,
  isLoadingMore = false,
  onNearEnd,
  className,
}: {
  segments: ContentEditorSegment[];
  focusedSegmentId: string;
  dirtySegmentIds?: ReadonlySet<string>;
  canEdit: boolean;
  loadingSegmentIds?: ReadonlySet<string>;
  isApproving?: boolean;
  isSavingDraft?: boolean;
  isPostingComment?: boolean;
  isLookingUpContext?: boolean;
  isAiSuggestionLoading?: boolean;
  isFormatChecksLoading?: boolean;
  isImageBusy?: boolean;
  isImageGenerating?: boolean;
  generatingImageSegmentId?: string;
  canUseAiRecommendation?: boolean;
  focusedIntelligence?: ContentEditorSegmentIntelligence | null;
  aiRecommendationError?: string;
  aiRecommendationCreditExhausted?: boolean;
  formatChecks?: ContentEditorFormatCheck[];
  segmentFormatChecks?: Record<string, ContentEditorFormatCheck[]>;
  formatCheckLoadingSegmentIds?: ReadonlySet<string>;
  primaryActionLabel?: string;
  segmentShareUrl?: string | null;
  onFocusSegment: (segmentId: string) => void;
  onVisibleRangeChange: (range: { visibleSegmentIds: string[]; loadSegmentIds: string[] }) => void;
  onTargetChange: (segmentId: string, value: string) => void;
  onApprove?: (segmentId: string) => void;
  onSaveDraft?: (segmentId: string) => void;
  onAddToIssueSheet?: (segmentId: string) => void;
  onUseAiSuggestion?: (segmentId: string) => void;
  onExplainGuideline?: (segmentId: string, check: ContentEditorFormatCheck) => void;
  explainingGuidelineCheckId?: string | null;
  onGenerateAiRecommendation?: (segmentId: string) => void;
  onTreatAsImage?: (segmentId: string, treatAsImage: boolean) => void;
  onTreatAsVideo?: (segmentId: string, treatAsVideo: boolean) => void;
  onRegenerateImage?: (segmentId: string) => void;
  onUploadImage?: (segmentId: string, file: File) => void;
  onToggleLocked?: (segmentId: string) => void | Promise<void>;
  checkedSegmentIds?: ReadonlySet<string>;
  showSelection?: boolean;
  onToggleSegmentChecked?: ContentEditorSegmentCheckHandler;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onNearEnd?: () => void;
  className?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  // Rows are memoised: hand them one stable set of handlers that reads the latest
  // props, so focusing a row or typing in it does not re-render every row.
  const latestActions = useRef<SideBySideRowActionProps>({});
  useLayoutEffect(() => {
    latestActions.current = {
      onFocusSegment,
      onTargetChange,
      onApprove,
      onSaveDraft,
      onAddToIssueSheet,
      onUseAiSuggestion,
      onExplainGuideline,
      onGenerateAiRecommendation,
      onTreatAsImage,
      onTreatAsVideo,
      onRegenerateImage,
      onUploadImage,
      onToggleLocked,
      onToggleSegmentChecked,
    };
  });
  const [rowActions] = useState(() => createSideBySideRowActions(latestActions));
  const availableActions = useAvailableRowActions({
    onApprove,
    onSaveDraft,
    onAddToIssueSheet,
    onUseAiSuggestion,
    onExplainGuideline,
    onGenerateAiRecommendation,
    onTreatAsImage,
    onTreatAsVideo,
    onRegenerateImage,
    onUploadImage,
    onToggleLocked,
  });
  const checkForNearEnd = useNearEndPagination({
    hasMore,
    isLoadingMore,
    itemCount: segments.length,
    prefetchDistance: 10,
    onNearEnd,
  });

  const publishVisibleRange = useCallback(
    (
      items: Array<{ index: number; start: number; end: number }>,
      metrics: { scrollOffset: number; viewportHeight: number },
    ) => {
      onVisibleRangeChange(
        partitionSideBySideVirtualItems({
          items,
          segments,
          scrollOffset: metrics.scrollOffset,
          viewportHeight: metrics.viewportHeight,
        }),
      );
    },
    [onVisibleRangeChange, segments],
  );

  const previousSelectedId = useRef<string | null>(null);
  const getItemKey = useCallback((index: number) => segments[index]?.id ?? index, [segments]);

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 6,
    getItemKey,
    onChange: (instance) => {
      const virtualItems = instance.getVirtualItems();
      const scrollElement = parentRef.current;
      checkForNearEnd(virtualItems);
      publishVisibleRange(virtualItems, {
        scrollOffset: instance.scrollOffset ?? scrollElement?.scrollTop ?? 0,
        viewportHeight: instance.scrollRect?.height ?? scrollElement?.clientHeight ?? 0,
      });
    },
  });

  useEditorPageWindow(segments, parentRef, virtualizer);

  useEffect(() => {
    if (previousSelectedId.current === focusedSegmentId) return;
    const index = segments.findIndex((segment) => segment.id === focusedSegmentId);
    if (index < 0) return;
    previousSelectedId.current = focusedSegmentId;
    virtualizer.scrollToIndex(index, { align: "auto" });
  }, [focusedSegmentId, segments, virtualizer]);

  useEffect(() => {
    const virtualItems = virtualizer.getVirtualItems();
    const scrollElement = parentRef.current;
    checkForNearEnd(virtualItems);
    publishVisibleRange(virtualItems, {
      scrollOffset: virtualizer.scrollOffset ?? scrollElement?.scrollTop ?? 0,
      viewportHeight: virtualizer.scrollRect?.height ?? scrollElement?.clientHeight ?? 0,
    });
  }, [checkForNearEnd, publishVisibleRange, virtualizer]);

  useEffect(
    () => () => {
      onVisibleRangeChange({ visibleSegmentIds: [], loadSegmentIds: [] });
    },
    [onVisibleRangeChange],
  );

  return (
    <div
      ref={parentRef}
      className={cn("min-h-0 flex-1 overflow-auto [overflow-anchor:none]", className)}
    >
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const segment = segments[virtualRow.index];
          if (!segment) {
            return null;
          }
          const isFocused = segment.id === focusedSegmentId;

          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <SideBySideVirtualRow
                segment={segment}
                isFocused={isFocused}
                isDirty={dirtySegmentIds?.has(segment.id) ?? false}
                canEdit={canEdit}
                isTargetLoading={loadingSegmentIds?.has(segment.id) ?? false}
                isApproving={isApproving && isFocused}
                isSavingDraft={isSavingDraft && isFocused}
                isPostingComment={isPostingComment}
                isLookingUpContext={isLookingUpContext}
                isAiSuggestionLoading={isAiSuggestionLoading && isFocused}
                isFormatChecksLoading={
                  (formatCheckLoadingSegmentIds?.has(segment.id) ?? false) ||
                  (isFormatChecksLoading && isFocused)
                }
                isImageBusy={isImageBusy && isFocused}
                isImageGenerating={isContentEditorImageGenerating({
                  isPending: isImageGenerating,
                  pendingExternalStringId: generatingImageSegmentId,
                  targetLocale: segment.targetLocale,
                  externalStringId: segment.id,
                })}
                canUseAiRecommendation={canUseAiRecommendation}
                intelligence={isFocused ? focusedIntelligence : null}
                aiRecommendationError={isFocused ? aiRecommendationError : undefined}
                aiRecommendationCreditExhausted={isFocused && aiRecommendationCreditExhausted}
                formatChecks={
                  segmentFormatChecks?.[segment.id] ?? (isFocused ? formatChecks : NO_FORMAT_CHECKS)
                }
                primaryActionLabel={primaryActionLabel}
                segmentShareUrl={isFocused ? segmentShareUrl : null}
                explainingGuidelineCheckId={explainingGuidelineCheckId}
                checkedSegmentIds={checkedSegmentIds}
                selectable={showSelection && Boolean(onToggleSegmentChecked)}
                actions={rowActions}
                available={availableActions}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
