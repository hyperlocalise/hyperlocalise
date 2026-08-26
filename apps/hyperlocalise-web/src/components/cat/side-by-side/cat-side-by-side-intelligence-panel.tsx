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
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import { CatEditorCommentsSection } from "@/components/cat/editor/cat-editor-comments-section";
import { CatEditorShortcutKbd } from "@/components/cat/editor/cat-editor-shortcut-kbd";
import { CatEditorIssuesSection } from "@/components/cat/issues/cat-editor-issues-section";
import { CatIntelligencePanel } from "@/components/cat/intelligence/cat-intelligence-panel";
import { CatSegmentKeyMeta } from "@/components/cat/segment/cat-segment-key-meta";
import {
  catEditorPanelMessages,
  catSideBySidePanelMessages,
} from "@/components/cat/shared/cat.messages";
import type {
  CatSegment,
  CatSegmentCommentInput,
  CatSegmentIntelligence,
  CatTranslationMemoryMatch,
} from "@/components/cat/shared/types";
import type { IssueSheetCreateStringLink } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/issue-sheet/_components/issue-sheet-create-issue-dialog";

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
  onAddComment,
  onOpenIssueSheet,
  onResolveComment,
  organizationSlug,
  projectId,
  nativeIssuesEnabled = false,
  translationKeyId = null,
  issueTargetLocale = null,
  issueStringLink = null,
  onNativeOpenIssueCountChange,
  showMaxLengthEditor = false,
  isMaxLengthSaving = false,
  onSetMaxLength,
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
  onAddComment?: (input: CatSegmentCommentInput) => void | Promise<void>;
  onOpenIssueSheet?: () => void;
  onResolveComment?: (commentId: string) => void | Promise<void>;
  organizationSlug?: string;
  projectId?: string;
  nativeIssuesEnabled?: boolean;
  translationKeyId?: string | null;
  issueTargetLocale?: string | null;
  issueStringLink?: IssueSheetCreateStringLink | null;
  onNativeOpenIssueCountChange?: (openIssueCount: number) => void;
  showMaxLengthEditor?: boolean;
  isMaxLengthSaving?: boolean;
  onSetMaxLength?: (maxLength: number | null) => void | Promise<void>;
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
      showMaxLengthEditor={showMaxLengthEditor}
      isMaxLengthSaving={isMaxLengthSaving}
      canEditTranslations={canEditTranslations && !segment.isLocked}
      canLookupFreshContext={canLookupFreshContext}
      onRefreshContext={onRefreshContext}
      onUseTmMatch={onUseTmMatch}
      onSetMaxLength={segment.isLocked ? undefined : onSetMaxLength}
    />
  );
  const commentsPanel = (
    <>
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
        onOpenIssueSheet={onOpenIssueSheet}
        onResolveComment={onResolveComment}
      />
      {nativeIssuesEnabled && organizationSlug && projectId ? (
        <CatEditorIssuesSection
          organizationSlug={organizationSlug}
          projectId={projectId}
          translationKeyId={translationKeyId}
          targetLocale={issueTargetLocale}
          stringLink={issueStringLink}
          canCreate={canAddComment}
          onOpenIssueCountChange={onNativeOpenIssueCountChange}
        />
      ) : null}
    </>
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
        <CatSegmentKeyMeta
          className="min-w-0 flex-1"
          segmentKey={segment.key}
          sourcePath={segment.sourcePath}
        />
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
