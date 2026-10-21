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
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { XIcon } from "@phosphor-icons/react";
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { ContentEditorEditorCommentsSection } from "@/components/content-editor/editor/content-editor-editor-comments-section";
import { ContentEditorEditorFormatChecksSection } from "@/components/content-editor/editor/content-editor-editor-format-checks-section";
import { ContentEditorShortcutHint } from "@/components/content-editor/editor/content-editor-shortcut-hints";
import { ContentEditorIntelligencePanel } from "@/components/content-editor/intelligence/content-editor-intelligence-panel";
import { ContentEditorUnicodePanel } from "@/components/content-editor/intelligence/content-editor-unicode-panel";
import { ContentEditorSegmentKeyMeta } from "@/components/content-editor/segment/content-editor-segment-key-meta";
import { isContentEditorAssetContentKind } from "@/components/content-editor/shared/content-editor-content-kind";
import { isNativeContentEditorProviderKind } from "@/components/content-editor/shared/content-editor-native-project";
import {
  contentEditorSideBySidePanelMessages,
  contentEditorUnicodePanelMessages,
} from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
  ContentEditorSegmentCommentInput,
  ContentEditorSegmentIntelligence,
  ContentEditorTranslationMemoryMatch,
} from "@/components/content-editor/shared/types";
import { useContentEditorWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { contentEditorWorkspaceViewMessages } from "@/components/content-editor/workspace/content-editor-workspace.messages";

import { actionableFormatChecks } from "./content-editor-side-by-side-qa";

export const ContentEditorSideBySideIntelligencePanel = observer(
  function ContentEditorSideBySideIntelligencePanel({
    segment,
    intelligence,
    isLookingUpContext,
    isApproving = false,
    isSavingDraft = false,
    isAiSuggestionLoading = false,
    isFormatChecksLoading = false,
    formatChecks = [],
    isConcordanceLoading,
    isVisualContextLoading,
    showAgentContext,
    showVisualContext,
    canUploadVisualContext = false,
    isUploadingVisualContext = false,
    onUploadVisualContext,
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
    onInsertCharacter,
    onAddComment,
    onOpenIssueSheet,
    onResolveComment,
    showMaxLengthEditor = false,
    isMaxLengthSaving = false,
    onSetMaxLength,
    placement = "bottom",
    className,
    organizationSlug,
    projectId,
    onGlossaryTermAdded,
  }: {
    segment: ContentEditorSegment | null;
    intelligence: ContentEditorSegmentIntelligence | null;
    isLookingUpContext: boolean;
    isApproving?: boolean;
    isSavingDraft?: boolean;
    isAiSuggestionLoading?: boolean;
    isFormatChecksLoading?: boolean;
    formatChecks?: ContentEditorFormatCheck[];
    isConcordanceLoading: boolean;
    isVisualContextLoading: boolean;
    showAgentContext: boolean;
    showVisualContext: boolean;
    canUploadVisualContext?: boolean;
    isUploadingVisualContext?: boolean;
    onUploadVisualContext?: (file: File) => void | Promise<void>;
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
    onUseTmMatch?: (match: ContentEditorTranslationMemoryMatch) => void;
    onInsertCharacter?: (character: string) => void;
    onAddComment?: (input: ContentEditorSegmentCommentInput) => void | Promise<void>;
    onOpenIssueSheet?: () => void;
    onResolveComment?: (commentId: string) => void | Promise<void>;
    showMaxLengthEditor?: boolean;
    isMaxLengthSaving?: boolean;
    onSetMaxLength?: (maxLength: number | null) => void | Promise<void>;
    placement?: "bottom" | "right";
    className?: string;
    organizationSlug?: string;
    projectId?: string;
    onGlossaryTermAdded?: () => void;
  }) {
    const intl = useIntl();
    const workspace = useContentEditorWorkspace();
    const fileContext = workspace.fileContext;
    const qaDetailsRevealNonce = workspace.ui.qaDetailsRevealNonce;
    const canTriggerFindContext =
      Boolean(onAskQuestion) &&
      canLookupFreshContext &&
      !isApproving &&
      !isSavingDraft &&
      !isLookingUpContext &&
      !isAiSuggestionLoading &&
      !isFormatChecksLoading;

    const [tabState, setTabState] = useState<{ tab: DetailsTab; revealNonce: number }>(() => ({
      tab: "details",
      revealNonce: qaDetailsRevealNonce,
    }));
    // A newer reveal request than the one the current tab was chosen under wins.
    const activeTab = qaDetailsRevealNonce !== tabState.revealNonce ? "qa" : tabState.tab;

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
            "h-full min-h-32 border-border",
            placement === "right" ? "border-l" : "border-t",
            className,
          )}
        >
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            height="full"
            padding="2u"
            background="muted"
          >
            <Text size="small" tone="subtle">
              <FormattedMessage {...contentEditorSideBySidePanelMessages.emptyIntelligence} />
            </Text>
          </Box>
        </div>
      );
    }

    const intelligencePanel = (
      <ContentEditorIntelligencePanel
        intelligence={intelligence}
        segmentId={segment.id}
        segmentKey={segment.key}
        contentKind={segment.contentKind}
        sourceText={segment.sourceText}
        targetText={segment.targetText}
        sourceLocale={segment.sourceLocale}
        targetLocale={segment.targetLocale}
        organizationSlug={organizationSlug}
        projectId={projectId}
        teamGlossaries={fileContext.teamGlossaries ?? []}
        contributorTeams={fileContext.contributorTeams ?? []}
        projectTeamId={fileContext.projectTeamId}
        canContributeTeamGlossary={
          Boolean(fileContext.canContributeTeamGlossary) &&
          isNativeContentEditorProviderKind(fileContext.providerKind)
        }
        teamName={fileContext.teamName}
        projectTeamSlug={fileContext.projectTeamSlug}
        isLookingUpContext={isLookingUpContext}
        isConcordanceLoading={isConcordanceLoading}
        isVisualContextLoading={isVisualContextLoading}
        showAgentContext={showAgentContext}
        showVisualContext={showVisualContext}
        canUploadVisualContext={canUploadVisualContext}
        isUploadingVisualContext={isUploadingVisualContext}
        onUploadVisualContext={onUploadVisualContext}
        showMaxLengthEditor={showMaxLengthEditor}
        isMaxLengthSaving={isMaxLengthSaving}
        canEditTranslations={canEditTranslations}
        isTranslationLocked={Boolean(segment.isLocked)}
        canLookupFreshContext={canLookupFreshContext}
        onRefreshContext={onRefreshContext}
        onUseTmMatch={onUseTmMatch}
        onSetMaxLength={segment.isLocked ? undefined : onSetMaxLength}
        onGlossaryTermAdded={onGlossaryTermAdded}
        canTriggerFindContext={canTriggerFindContext}
        onFindContext={onAskQuestion}
        embedded
      />
    );
    const commentsPanel = (
      <>
        <ContentEditorEditorCommentsSection
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
          variant="inspector"
        />
      </>
    );

    if (placement === "right") {
      const qaIssueCount = actionableFormatChecks(formatChecks).length;
      const commentCount =
        workspace.segmentComments.get(segment.id)?.length ?? segment.comments?.length ?? 0;
      const showUnicodeTab = !isContentEditorAssetContentKind(segment.contentKind);
      const resolvedTab = activeTab === "unicode" && !showUnicodeTab ? "details" : activeTab;
      const canInsertUnicode = canEditTranslations && !segment.isLocked;

      return (
        <Tabs
          value={resolvedTab}
          onValueChange={(value) =>
            setTabState({ tab: value as DetailsTab, revealNonce: qaDetailsRevealNonce })
          }
          className={cn("h-full min-h-0 gap-0 border-l border-border bg-background", className)}
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-2">
            <TabsList variant="line" className="h-10 min-w-0 flex-1 justify-start overflow-x-auto">
              <TabsTrigger value="details">
                <FormattedMessage {...contentEditorSideBySidePanelMessages.detailsTab} />
              </TabsTrigger>
              <TabsTrigger value="qa">
                <FormattedMessage {...contentEditorSideBySidePanelMessages.qaChecksTab} />
                {qaIssueCount > 0 ? <TabCount count={qaIssueCount} tone="alert" /> : null}
              </TabsTrigger>
              <TabsTrigger value="comments">
                <FormattedMessage {...contentEditorSideBySidePanelMessages.commentsTab} />
                {commentCount > 0 ? <TabCount count={commentCount} tone="count" /> : null}
              </TabsTrigger>
              {showUnicodeTab ? (
                <TabsTrigger value="unicode">
                  <FormattedMessage {...contentEditorUnicodePanelMessages.title} />
                </TabsTrigger>
              ) : null}
            </TabsList>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="relative ms-auto size-8 shrink-0"
              aria-label={intl.formatMessage(contentEditorWorkspaceViewMessages.hideDetailsPanel)}
              onClick={() => workspace.ui.setDetailsPanelCollapsed(true)}
            >
              <XIcon className="size-4" />
              <ContentEditorShortcutHint shortcut="toggleDetailsPanel" placement="below" />
            </Button>
          </div>

          <TabsContent value="details" className="flex min-h-0 flex-col">
            {intelligencePanel}
          </TabsContent>

          <TabsContent value="qa" className="min-h-0 overflow-y-auto" data-qa-details>
            <Box paddingX="2u" paddingY="1.5u">
              {isFormatChecksLoading || formatChecks.length > 0 ? (
                <ContentEditorEditorFormatChecksSection
                  formatChecks={formatChecks}
                  isLoading={isFormatChecksLoading}
                />
              ) : (
                <Text size="small" tone="subtle">
                  <FormattedMessage {...contentEditorSideBySidePanelMessages.noQaChecks} />
                </Text>
              )}
            </Box>
          </TabsContent>

          <TabsContent value="comments" className="min-h-0 overflow-y-auto" data-inspector-comments>
            <Box paddingX="2u" paddingY="2u">
              {commentsPanel}
            </Box>
          </TabsContent>

          {showUnicodeTab ? (
            <TabsContent value="unicode" className="min-h-0 overflow-y-auto" data-inspector-unicode>
              <Box paddingX="2u" paddingY="2u">
                <ContentEditorUnicodePanel
                  variant="tab"
                  canInsert={canInsertUnicode}
                  onInsertCharacter={onInsertCharacter}
                />
              </Box>
            </TabsContent>
          ) : null}
        </Tabs>
      );
    }

    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col border-t border-border bg-background",
          className,
        )}
      >
        <div className="shrink-0 border-b border-border">
          <Box paddingX="1.5u" paddingY="1u">
            <Row spacing="1u" align="spaceBetween" alignY="center">
              <ContentEditorSegmentKeyMeta
                className="min-w-0 flex-1"
                segmentKey={segment.key}
                sourcePath={segment.sourcePath}
              />
            </Row>
          </Box>
        </div>

        <div className="min-h-0 flex-1">
          <Columns spacing="0" collapseBelow="large">
            <Column width="fluid">
              <ScrollArea className="min-h-0">
                <Box padding="2u">{intelligencePanel}</Box>
              </ScrollArea>
            </Column>
            <Column width="content">
              <div className="min-h-0 border-t border-border lg:border-t-0 lg:border-l lg:w-[22rem]">
                <Box paddingX="2u" paddingBottom="2u">
                  <div className="space-y-4">
                    {commentsPanel}
                    {isContentEditorAssetContentKind(segment.contentKind) ? null : (
                      <ContentEditorUnicodePanel
                        canInsert={canEditTranslations && !segment.isLocked}
                        onInsertCharacter={onInsertCharacter}
                      />
                    )}
                  </div>
                </Box>
              </div>
            </Column>
          </Columns>
        </div>
      </div>
    );
  },
);

type DetailsTab = "details" | "qa" | "comments" | "unicode";

function TabCount({ count, tone = "count" }: { count: number; tone?: "count" | "alert" }) {
  return (
    <span
      className={cn(
        "min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold tabular-nums",
        tone === "alert" ? "bg-destructive text-white" : "bg-foreground text-background",
      )}
    >
      {count}
    </span>
  );
}
