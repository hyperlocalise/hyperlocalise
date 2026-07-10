"use client";

import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import { CatEditorCommentsSection } from "@/components/cat/editor/cat-editor-comments-section";
import { CatEditorShortcutKbd } from "@/components/cat/editor/cat-editor-shortcut-kbd";
import { CatIntelligencePanel } from "@/components/cat/intelligence/cat-intelligence-panel";
import {
  catEditorPanelMessages,
  catSideBySidePanelMessages,
} from "@/components/cat/shared/cat.messages";
import type {
  CatGlossaryTerm,
  CatSegment,
  CatSegmentCommentInput,
  CatSegmentIntelligence,
  CatTranslationMemoryMatch,
} from "@/components/cat/shared/types";

export function CatSideBySideIntelligencePanel({
  segment,
  intelligence,
  isLookingUpContext,
  isApproving = false,
  isSavingDraft = false,
  isAiSuggestionLoading = false,
  isFormatChecksLoading = false,
  isConcordanceLoading,
  isVisualContextLoading,
  showAgentContext,
  showVisualContext,
  canEditTranslations,
  canLookupFreshContext,
  canAddComment,
  supportsIssueComments,
  isCommentsLoading,
  isPostingComment,
  isResolvingComment,
  resolvingCommentId,
  commentPostError,
  onAskQuestion,
  onRefreshContext,
  onUseTmMatch,
  onUseGlossaryTerm,
  onAddComment,
  onResolveComment,
  placement = "bottom",
  className,
}: {
  segment: CatSegment | null;
  intelligence: CatSegmentIntelligence | null;
  isLookingUpContext: boolean;
  isApproving?: boolean;
  isSavingDraft?: boolean;
  isAiSuggestionLoading?: boolean;
  isFormatChecksLoading?: boolean;
  isConcordanceLoading: boolean;
  isVisualContextLoading: boolean;
  showAgentContext: boolean;
  showVisualContext: boolean;
  canEditTranslations: boolean;
  canLookupFreshContext: boolean;
  canAddComment: boolean;
  supportsIssueComments: boolean;
  isCommentsLoading: boolean;
  isPostingComment: boolean;
  isResolvingComment: boolean;
  resolvingCommentId: string | null;
  commentPostError?: string;
  onAskQuestion?: () => void;
  onRefreshContext?: () => void;
  onUseTmMatch?: (match: CatTranslationMemoryMatch) => void;
  onUseGlossaryTerm?: (term: CatGlossaryTerm) => void;
  onAddComment?: (input: CatSegmentCommentInput) => void | Promise<void>;
  onResolveComment?: (commentId: string) => void | Promise<void>;
  placement?: "bottom" | "right";
  className?: string;
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const canTriggerFindContext =
    Boolean(onAskQuestion) &&
    canLookupFreshContext &&
    !isApproving &&
    !isSavingDraft &&
    !isLookingUpContext &&
    !isAiSuggestionLoading &&
    !isFormatChecksLoading;

  useHotkeys(
    "mod+k",
    (event) => {
      event.preventDefault();
      onAskQuestion?.();
    },
    {
      enabled: canTriggerFindContext,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [canTriggerFindContext, onAskQuestion],
  );

  if (!segment || !intelligence) {
    return (
      <div
        className={cn(
          "flex h-full min-h-32 items-center justify-center border-border bg-muted/30 px-4",
          placement === "right" ? "border-l" : "border-t",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...catSideBySidePanelMessages.emptyIntelligence} />
        </p>
      </div>
    );
  }

  const intelligencePanel = (
    <CatIntelligencePanel
      intelligence={intelligence}
      targetText={segment.targetText}
      isLookingUpContext={isLookingUpContext}
      isConcordanceLoading={isConcordanceLoading}
      isVisualContextLoading={isVisualContextLoading}
      showAgentContext={showAgentContext}
      showVisualContext={showVisualContext}
      canEditTranslations={canEditTranslations}
      canLookupFreshContext={canLookupFreshContext}
      onRefreshContext={onRefreshContext}
      onUseTmMatch={onUseTmMatch}
      onUseGlossaryTerm={onUseGlossaryTerm}
    />
  );
  const commentsPanel = (
    <CatEditorCommentsSection
      segment={segment}
      isLoading={isCommentsLoading}
      isPostingComment={isPostingComment}
      isResolvingComment={isResolvingComment}
      resolvingCommentId={resolvingCommentId}
      commentPostError={commentPostError}
      canAddComment={canAddComment}
      supportsIssueComments={supportsIssueComments}
      onAddComment={onAddComment}
      onResolveComment={onResolveComment}
    />
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col border-border bg-background",
        placement === "right" ? "border-l" : "border-t",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p
          className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
          title={segment.key}
        >
          {segment.key}
        </p>
        {onAskQuestion ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2.5"
            onClick={onAskQuestion}
            disabled={!canTriggerFindContext}
            title={
              canLookupFreshContext
                ? intl.formatMessage(catEditorPanelMessages.findContextTitle)
                : intl.formatMessage(catEditorPanelMessages.findContextUnavailableTitle)
            }
          >
            {isLookingUpContext ? <Spinner className="size-3.5" /> : null}
            {isLookingUpContext ? (
              <FormattedMessage {...catEditorPanelMessages.findingContext} />
            ) : (
              <FormattedMessage {...catEditorPanelMessages.findContext} />
            )}
            <CatEditorShortcutKbd shortcut="findContext" isMac={isMac} />
          </Button>
        ) : null}
      </div>

      {placement === "right" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">{intelligencePanel}</div>
          <div className="max-h-[45%] min-h-0 overflow-y-auto px-4 pb-4">{commentsPanel}</div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <ScrollArea className="min-h-0">
            <div className="p-4">{intelligencePanel}</div>
          </ScrollArea>

          <div className="min-h-0 border-t border-border px-4 pb-4 lg:border-t-0 lg:border-l">
            {commentsPanel}
          </div>
        </div>
      )}
    </div>
  );
}
