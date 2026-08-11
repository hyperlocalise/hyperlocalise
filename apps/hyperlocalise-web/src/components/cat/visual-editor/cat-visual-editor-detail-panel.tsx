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

import { CatEditorAiRecommendation } from "@/components/cat/editor/cat-editor-ai-recommendation";
import { CatEditorCommentsSection } from "@/components/cat/editor/cat-editor-comments-section";
import { CatEditorShortcutKbd } from "@/components/cat/editor/cat-editor-shortcut-kbd";
import { CatEditorSourceSection } from "@/components/cat/editor/cat-editor-source-section";
import { CatEditorTargetSection } from "@/components/cat/editor/cat-editor-target-section";
import { CatIntelligencePanel } from "@/components/cat/intelligence/cat-intelligence-panel";
import { SegmentStatusBadge } from "@/components/cat/segment/cat-segment-status";
import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";
import type {
  CatSegmentCommentInput,
  CatSegmentIntelligence,
  CatTranslationMemoryMatch,
} from "@/components/cat/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import type { CatVisualEditorSegment } from "./cat-visual-editor.fixture";
import { catVisualEditorMessages } from "./cat-visual-editor.messages";

export function CatVisualEditorDetailPanel({
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
  segment: CatVisualEditorSegment | null;
  segmentPosition: number;
  totalSegments: number;
  remainingCount: number;
  intelligence: CatSegmentIntelligence | null;
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
  onUseTmMatch?: (match: CatTranslationMemoryMatch) => void;
  onApprove: () => void;
  onSaveDraft?: () => void;
  onAddComment?: (input: CatSegmentCommentInput) => void | Promise<void>;
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
          <FormattedMessage {...catVisualEditorMessages.emptySelection} />
        </div>
      </aside>
    );
  }

  const heading =
    segment.contextLabel?.trim() ||
    intl.formatMessage(catVisualEditorMessages.selectedStringHeading);
  const canApprove = canEditTranslations && segment.targetText.trim().length > 0;

  return (
    <aside
      className={cn("flex h-full min-h-0 flex-col border-l border-border bg-background", className)}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 space-y-1.5">
          <h2 className="truncate text-sm font-semibold text-foreground">{heading}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <SegmentStatusBadge status={segment.status} />
            {isTargetDirty ? (
              <Badge variant="outline" className="border-bud-500/40 bg-bud-500/10 text-bud-300">
                <FormattedMessage {...catEditorPanelMessages.unsavedChanges} />
              </Badge>
            ) : null}
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              <FormattedMessage
                {...catVisualEditorMessages.stringPosition}
                values={{ position: segmentPosition, total: totalSegments }}
              />
            </span>
            {remainingCount > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                <FormattedMessage
                  {...catVisualEditorMessages.remainingCount}
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
            aria-label={intl.formatMessage(catEditorPanelMessages.previousSegmentAria)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNext}
            disabled={!hasNextSegment}
            aria-label={intl.formatMessage(catEditorPanelMessages.nextSegmentAria)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-4 py-4">
          <CatEditorSourceSection
            sourceText={segment.sourceText}
            sourceLocale={segment.sourceLocale}
            segmentKey={segment.key}
            sourcePath={segment.sourcePath}
          />

          <CatEditorTargetSection
            segment={segment}
            canEditTarget={canEditTranslations}
            onTargetChange={onTargetChange}
            onCopySource={onCopySource}
            onClearTarget={onClearTarget}
          />

          <CatEditorAiRecommendation
            intelligence={intelligence}
            isLoading={false}
            onUseAiSuggestion={onUseAiSuggestion}
          />
        </div>

        <div className="border-t border-border [&>div]:lg:border-l-0">
          <CatIntelligencePanel
            intelligence={intelligence}
            targetText={segment.targetText}
            showAgentContext={false}
            showVisualContext={false}
            canEditTranslations={canEditTranslations}
            canLookupFreshContext={false}
            onUseTmMatch={onUseTmMatch}
          />
        </div>

        <div className="border-t border-border px-4 py-4">
          <CatEditorCommentsSection
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
          <FormattedMessage {...catEditorPanelMessages.approve} />
          <CatEditorShortcutKbd
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
            <FormattedMessage {...catEditorPanelMessages.saveAsDraft} />
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
