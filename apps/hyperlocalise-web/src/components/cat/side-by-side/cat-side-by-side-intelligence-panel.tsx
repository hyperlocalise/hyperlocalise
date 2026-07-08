"use client";

import { FormattedMessage } from "react-intl";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/primitives/cn";

import { CatEditorCommentsSection } from "@/components/cat/editor/cat-editor-comments-section";
import { CatIntelligencePanel } from "@/components/cat/intelligence/cat-intelligence-panel";
import { catSideBySidePanelMessages } from "@/components/cat/shared/cat.messages";
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
  onRefreshContext,
  onUseTmMatch,
  onUseGlossaryTerm,
  onAddComment,
  onResolveComment,
  className,
}: {
  segment: CatSegment | null;
  intelligence: CatSegmentIntelligence | null;
  isLookingUpContext: boolean;
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
  onRefreshContext?: () => void;
  onUseTmMatch?: (match: CatTranslationMemoryMatch) => void;
  onUseGlossaryTerm?: (term: CatGlossaryTerm) => void;
  onAddComment?: (input: CatSegmentCommentInput) => void | Promise<void>;
  onResolveComment?: (commentId: string) => void | Promise<void>;
  className?: string;
}) {
  if (!segment || !intelligence) {
    return (
      <div
        className={cn(
          "flex h-full min-h-32 items-center justify-center border-t border-border bg-muted/30 px-4",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...catSideBySidePanelMessages.emptyIntelligence} />
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col border-t border-border bg-background", className)}
    >
      <div className="shrink-0 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <FormattedMessage {...catSideBySidePanelMessages.intelligencePanelTitle} />
          </h2>
          <span className="truncate font-mono text-xs text-foreground">{segment.key}</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <ScrollArea className="min-h-0">
          <div className="p-4">
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
          </div>
        </ScrollArea>

        <div className="min-h-0 border-t border-border lg:border-t-0 lg:border-l">
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
        </div>
      </div>
    </div>
  );
}
