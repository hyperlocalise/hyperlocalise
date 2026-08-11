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
import { FormattedMessage, useIntl } from "react-intl";

import { CatEditorActions } from "@/components/cat/editor/cat-editor-actions";
import { CatEditorAiRecommendation } from "@/components/cat/editor/cat-editor-ai-recommendation";
import { CatEditorCommentsSection } from "@/components/cat/editor/cat-editor-comments-section";
import { CatEditorHeader } from "@/components/cat/editor/cat-editor-header";
import { CatEditorSourceSection } from "@/components/cat/editor/cat-editor-source-section";
import { CatEditorTargetSection } from "@/components/cat/editor/cat-editor-target-section";
import { CatIntelligencePanel } from "@/components/cat/intelligence/cat-intelligence-panel";
import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";
import type {
  CatSegmentCommentInput,
  CatSegmentIntelligence,
  CatTranslationMemoryMatch,
} from "@/components/cat/shared/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import type { CatVisualEditorSegment } from "./cat-visual-editor.fixture";
import { catVisualEditorMessages } from "./cat-visual-editor.messages";

export function CatVisualEditorDetailPanel({
  segment,
  segmentPosition,
  totalSegments,
  intelligence,
  isTargetDirty = false,
  showAgentContext = true,
  showVisualContext = false,
  canEditTranslations = true,
  canLookupContext = false,
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
  onAskQuestion,
  onAddComment,
  onResolveComment,
  className,
}: {
  segment: CatVisualEditorSegment | null;
  segmentPosition: number;
  totalSegments: number;
  intelligence: CatSegmentIntelligence | null;
  isTargetDirty?: boolean;
  showAgentContext?: boolean;
  showVisualContext?: boolean;
  canEditTranslations?: boolean;
  canLookupContext?: boolean;
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
  onAskQuestion: () => void;
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

  return (
    <aside
      className={cn("flex h-full min-h-0 flex-col border-l border-border bg-background", className)}
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          <FormattedMessage
            {...catVisualEditorMessages.textNodeHeading}
            values={{ tag: segment.node.tagName }}
          />
        </h2>
      </div>

      <CatEditorHeader
        segment={segment}
        segmentPosition={segmentPosition}
        totalSegments={totalSegments}
        isTargetDirty={isTargetDirty}
        segmentShareUrl={null}
        hasPreviousSegment={hasPreviousSegment}
        hasNextSegment={hasNextSegment}
        isMac={isMac}
        onPrevious={onPrevious}
        onNext={onNext}
      />

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

          <CatEditorActions
            primaryActionLabel={intl.formatMessage(catEditorPanelMessages.approve)}
            isMac={isMac}
            canTriggerApprove={segment.targetText.trim().length > 0}
            canTriggerFindContext={false}
            canLookupContext={canLookupContext}
            isApproving={false}
            isSavingDraft={false}
            isLookingUpContext={false}
            hasPreviousSegment={hasPreviousSegment}
            hasNextSegment={hasNextSegment}
            onApprove={onApprove}
            onSaveDraft={onSaveDraft}
            onAskQuestion={onAskQuestion}
            onPrevious={onPrevious}
            onNext={onNext}
          />

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

        <div className="border-t border-border">
          <div className="h-[28rem]">
            <CatIntelligencePanel
              intelligence={intelligence}
              targetText={segment.targetText}
              showAgentContext={showAgentContext}
              showVisualContext={showVisualContext}
              canEditTranslations={canEditTranslations}
              canLookupFreshContext={false}
              onUseTmMatch={onUseTmMatch}
            />
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
