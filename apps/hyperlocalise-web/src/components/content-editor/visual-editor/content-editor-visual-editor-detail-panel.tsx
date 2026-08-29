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
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { ContentEditorEditorAiRecommendation } from "@/components/content-editor/editor/content-editor-editor-ai-recommendation";
import { ContentEditorEditorCommentsSection } from "@/components/content-editor/editor/content-editor-editor-comments-section";
import { ContentEditorEditorShortcutKbd } from "@/components/content-editor/editor/content-editor-editor-shortcut-kbd";
import { ContentEditorEditorSourceSection } from "@/components/content-editor/editor/content-editor-editor-source-section";
import { ContentEditorEditorTargetSection } from "@/components/content-editor/editor/content-editor-editor-target-section";
import { ContentEditorIntelligencePanel } from "@/components/content-editor/intelligence/content-editor-intelligence-panel";
import { ContentEditorHiddenStringBadge } from "@/components/content-editor/segment/content-editor-hidden-string-badge";
import { ContentEditorLockedStringBadge } from "@/components/content-editor/segment/content-editor-locked-string-badge";
import {
  SegmentStatusBadge,
  shouldShowSegmentStatusBadge,
} from "@/components/content-editor/segment/content-editor-segment-status";
import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorSegmentCommentInput,
  ContentEditorSegmentIntelligence,
  ContentEditorTranslationMemoryMatch,
} from "@/components/content-editor/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import { contentEditorVisualEditorMessages } from "./content-editor-visual-editor.messages";
import type { ContentEditorVisualEditorSegment } from "./content-editor-visual-editor.types";

export function ContentEditorVisualEditorDetailPanel({
  segment,
  segmentPosition,
  totalSegments,
  remainingCount,
  intelligence,
  isTargetDirty = false,
  canEditTranslations = true,
  hasPreviousSegment,
  hasNextSegment,
  onPrevious,
  onNext,
  onTargetChange,
  onCopySource,
  onClearTarget,
  onUseAiSuggestion,
  onUseTmMatch,
  onApprove,
  onSaveDraft,
  onAddComment,
  onResolveComment,
  className,
}: {
  segment: ContentEditorVisualEditorSegment | null;
  segmentPosition: number;
  totalSegments: number;
  remainingCount: number;
  intelligence: ContentEditorSegmentIntelligence | null;
  isTargetDirty?: boolean;
  canEditTranslations?: boolean;
  hasPreviousSegment: boolean;
  hasNextSegment: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onTargetChange: (value: string) => void;
  onCopySource: () => void;
  onClearTarget: () => void;
  onUseAiSuggestion: () => void;
  onUseTmMatch?: (match: ContentEditorTranslationMemoryMatch) => void;
  onApprove: () => void;
  onSaveDraft?: () => void;
  onAddComment?: (input: ContentEditorSegmentCommentInput) => void | Promise<void>;
  onResolveComment?: (commentId: string) => void | Promise<void>;
  className?: string;
}) {
  const intl = useIntl();
  const isMac = useIsMac();

  if (!segment || !intelligence) {
    return (
      <aside
        className={cn(
          "flex h-full min-h-0 flex-col border-l border-border bg-background",
          className,
        )}
      >
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          <FormattedMessage {...contentEditorVisualEditorMessages.emptySelection} />
        </div>
      </aside>
    );
  }

  const heading =
    segment.contextLabel?.trim() ||
    intl.formatMessage(contentEditorVisualEditorMessages.selectedStringHeading);
  const canApprove =
    canEditTranslations && !segment.isLocked && segment.targetText.trim().length > 0;

  return (
    <aside
      className={cn("flex h-full min-h-0 flex-col border-l border-border bg-background", className)}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 space-y-1.5">
          <h2 className="truncate text-sm font-semibold text-foreground">{heading}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {shouldShowSegmentStatusBadge(segment.status, segment.isHidden) ? (
              <SegmentStatusBadge status={segment.status} />
            ) : null}
            {segment.isHidden ? <ContentEditorHiddenStringBadge /> : null}
            {segment.isLocked ? <ContentEditorLockedStringBadge /> : null}
            {isTargetDirty ? (
              <Badge variant="outline" className="border-bud-500/40 bg-bud-500/10 text-bud-300">
                <FormattedMessage {...contentEditorEditorPanelMessages.unsavedChanges} />
              </Badge>
            ) : null}
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              <FormattedMessage
                {...contentEditorVisualEditorMessages.stringPosition}
                values={{ position: segmentPosition, total: totalSegments }}
              />
            </span>
            {remainingCount > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                <FormattedMessage
                  {...contentEditorVisualEditorMessages.remainingCount}
                  values={{ count: remainingCount }}
                />
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onPrevious}
            disabled={!hasPreviousSegment}
            aria-label={intl.formatMessage(contentEditorEditorPanelMessages.previousSegmentAria)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNext}
            disabled={!hasNextSegment}
            aria-label={intl.formatMessage(contentEditorEditorPanelMessages.nextSegmentAria)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-4 py-4">
          <ContentEditorEditorSourceSection
            sourceText={segment.sourceText}
            sourceLocale={segment.sourceLocale}
            segmentKey={segment.key}
            sourcePath={segment.sourcePath}
          />

          <ContentEditorEditorTargetSection
            segment={segment}
            canEditTarget={canEditTranslations && !segment.isLocked}
            onTargetChange={onTargetChange}
            onCopySource={onCopySource}
            onClearTarget={onClearTarget}
          />

          <ContentEditorEditorAiRecommendation
            intelligence={intelligence}
            isLoading={false}
            onUseAiSuggestion={onUseAiSuggestion}
          />
        </div>

        <div className="border-t border-border [&>div]:lg:border-l-0">
          <ContentEditorIntelligencePanel
            intelligence={intelligence}
            targetText={segment.targetText}
            showAgentContext={false}
            showVisualContext={false}
            canEditTranslations={canEditTranslations}
            isTranslationLocked={Boolean(segment.isLocked)}
            canLookupFreshContext={false}
            onUseTmMatch={onUseTmMatch}
          />
        </div>

        <div className="border-t border-border px-4 py-4">
          <ContentEditorEditorCommentsSection
            segment={segment}
            isLoading={false}
            canAddComment={Boolean(onAddComment)}
            supportsIssueComments={false}
            isPostingComment={false}
            isResolvingComment={false}
            resolvingCommentId={null}
            onAddComment={onAddComment}
            onResolveComment={onResolveComment}
          />
        </div>
      </ScrollArea>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background px-4 py-3">
        <Button
          variant="default"
          className="min-h-10 flex-1 sm:flex-none"
          onClick={onApprove}
          disabled={!canApprove}
        >
          <FormattedMessage {...contentEditorEditorPanelMessages.approve} />
          <ContentEditorEditorShortcutKbd
            shortcut="approve"
            isMac={isMac}
            className="bg-primary-foreground/15 text-primary-foreground"
          />
        </Button>
        {onSaveDraft ? (
          <Button
            variant="outline"
            className="min-h-10 flex-1 sm:flex-none"
            onClick={onSaveDraft}
            disabled={!canApprove}
          >
            <FormattedMessage {...contentEditorEditorPanelMessages.saveAsDraft} />
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
