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
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/primitives/cn";

import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";

import { ContentEditorSideBySideRow } from "./content-editor-side-by-side-row";
import { partitionSideBySideVirtualItems } from "./content-editor-side-by-side-visible-range";

const ESTIMATED_ROW_HEIGHT = 72;

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
  canUseAiRecommendation = false,
  focusedIntelligence = null,
  aiRecommendationError,
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
  onGenerateAiRecommendation,
  onTreatAsImage,
  onTreatAsVideo,
  onRegenerateImage,
  onUploadImage,
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
  canUseAiRecommendation?: boolean;
  focusedIntelligence?: ContentEditorSegmentIntelligence | null;
  aiRecommendationError?: string;
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
  onGenerateAiRecommendation?: (segmentId: string) => void;
  onTreatAsImage?: (segmentId: string, treatAsImage: boolean) => void;
  onTreatAsVideo?: (segmentId: string, treatAsVideo: boolean) => void;
  onRegenerateImage?: (segmentId: string) => void;
  onUploadImage?: (segmentId: string, file: File) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onNearEnd?: () => void;
  className?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const loadRequestedForLengthRef = useRef<number | null>(null);

  const checkForNearEnd = useCallback(
    (items: Array<{ index: number }>) => {
      if (items.length === 0 || segments.length === 0) {
        return;
      }

      const lastItem = items.at(-1);
      if (!lastItem || lastItem.index < Math.max(segments.length - 3, 0)) {
        return;
      }

      if (!hasMore || isLoadingMore || loadRequestedForLengthRef.current === segments.length) {
        return;
      }

      loadRequestedForLengthRef.current = segments.length;
      onNearEnd?.();
    },
    [hasMore, isLoadingMore, onNearEnd, segments.length],
  );

  const publishVisibleRange = useCallback(
    (instance: {
      getVirtualItems: () => Array<{ index: number; start: number; end: number }>;
      scrollOffset?: number;
      scrollRect?: { height: number } | null;
      getScrollElement?: () => HTMLElement | null;
    }) => {
      const scrollElement = instance.getScrollElement?.() ?? parentRef.current;
      const range = partitionSideBySideVirtualItems({
        items: instance.getVirtualItems(),
        segments,
        scrollOffset: instance.scrollOffset ?? scrollElement?.scrollTop ?? 0,
        viewportHeight: instance.scrollRect?.height ?? scrollElement?.clientHeight ?? 0,
      });
      onVisibleRangeChange(range);
    },
    [onVisibleRangeChange, segments],
  );

  const getItemKey = useCallback((index: number) => segments[index]?.id ?? index, [segments]);

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 6,
    getItemKey,
    onChange: (instance) => {
      const virtualItems = instance.getVirtualItems();
      checkForNearEnd(virtualItems);
      publishVisibleRange(instance);
    },
  });

  useEffect(() => {
    if (!isLoadingMore) {
      loadRequestedForLengthRef.current = null;
    }
  }, [isLoadingMore]);

  useEffect(() => {
    const virtualItems = virtualizer.getVirtualItems();
    checkForNearEnd(virtualItems);
    publishVisibleRange(virtualizer);
  }, [checkForNearEnd, publishVisibleRange, virtualizer]);

  useEffect(
    () => () => {
      onVisibleRangeChange({ visibleSegmentIds: [], loadSegmentIds: [] });
    },
    [onVisibleRangeChange],
  );

  return (
    <div ref={parentRef} className={cn("min-h-0 flex-1 overflow-auto", className)}>
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const segment = segments[virtualRow.index];
          if (!segment) {
            return null;
          }

          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <ContentEditorSideBySideRow
                segment={segment}
                isFocused={segment.id === focusedSegmentId}
                isDirty={dirtySegmentIds?.has(segment.id) ?? false}
                canEdit={canEdit}
                isTargetLoading={loadingSegmentIds?.has(segment.id) ?? false}
                isApproving={isApproving && segment.id === focusedSegmentId}
                isSavingDraft={isSavingDraft && segment.id === focusedSegmentId}
                isPostingComment={isPostingComment}
                isLookingUpContext={isLookingUpContext}
                isAiSuggestionLoading={isAiSuggestionLoading && segment.id === focusedSegmentId}
                isFormatChecksLoading={
                  (formatCheckLoadingSegmentIds?.has(segment.id) ?? false) ||
                  (isFormatChecksLoading && segment.id === focusedSegmentId)
                }
                isImageBusy={isImageBusy && segment.id === focusedSegmentId}
                canUseAiRecommendation={canUseAiRecommendation}
                intelligence={segment.id === focusedSegmentId ? focusedIntelligence : null}
                aiRecommendationError={
                  segment.id === focusedSegmentId ? aiRecommendationError : undefined
                }
                formatChecks={
                  segmentFormatChecks?.[segment.id] ??
                  (segment.id === focusedSegmentId ? formatChecks : [])
                }
                primaryActionLabel={primaryActionLabel}
                segmentShareUrl={segment.id === focusedSegmentId ? segmentShareUrl : null}
                onFocus={() => onFocusSegment(segment.id)}
                onTargetChange={(value) => onTargetChange(segment.id, value)}
                onApprove={onApprove ? () => onApprove(segment.id) : undefined}
                onSaveDraft={onSaveDraft ? () => onSaveDraft(segment.id) : undefined}
                onAddToIssueSheet={
                  onAddToIssueSheet ? () => onAddToIssueSheet(segment.id) : undefined
                }
                onUseAiSuggestion={
                  onUseAiSuggestion ? () => onUseAiSuggestion(segment.id) : undefined
                }
                onGenerateAiRecommendation={
                  onGenerateAiRecommendation
                    ? () => onGenerateAiRecommendation(segment.id)
                    : undefined
                }
                onTreatAsImage={
                  onTreatAsImage
                    ? (treatAsImage) => onTreatAsImage(segment.id, treatAsImage)
                    : undefined
                }
                onTreatAsVideo={
                  onTreatAsVideo
                    ? (treatAsVideo) => onTreatAsVideo(segment.id, treatAsVideo)
                    : undefined
                }
                onRegenerateImage={
                  onRegenerateImage ? () => onRegenerateImage(segment.id) : undefined
                }
                onUploadImage={
                  onUploadImage ? (file) => onUploadImage(segment.id, file) : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
