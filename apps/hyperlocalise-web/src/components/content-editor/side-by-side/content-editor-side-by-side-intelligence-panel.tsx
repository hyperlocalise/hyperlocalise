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
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/typography";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import { ContentEditorEditorCommentsSection } from "@/components/content-editor/editor/content-editor-editor-comments-section";
import { ContentEditorEditorFormatChecksSection } from "@/components/content-editor/editor/content-editor-editor-format-checks-section";
import { ContentEditorEditorShortcutKbd } from "@/components/content-editor/editor/content-editor-editor-shortcut-kbd";
import { ContentEditorIntelligencePanel } from "@/components/content-editor/intelligence/content-editor-intelligence-panel";
import { ContentEditorSegmentKeyMeta } from "@/components/content-editor/segment/content-editor-segment-key-meta";
import { isNativeContentEditorProviderKind } from "@/components/content-editor/shared/content-editor-native-project";
import {
  contentEditorEditorPanelMessages,
  contentEditorSideBySidePanelMessages,
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
    const isMac = useIsMac();
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

    const findContextButton = onAskQuestion ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAskQuestion}
        disabled={!canTriggerFindContext}
        title={
          canLookupFreshContext
            ? intl.formatMessage(contentEditorEditorPanelMessages.findContextTitle)
            : intl.formatMessage(contentEditorEditorPanelMessages.findContextUnavailableTitle)
        }
      >
        {isLookingUpContext ? <Spinner className="size-3.5" /> : null}
        {isLookingUpContext ? (
          <FormattedMessage {...contentEditorEditorPanelMessages.findingContext} />
        ) : (
          <FormattedMessage {...contentEditorEditorPanelMessages.findContext} />
        )}
        <ContentEditorEditorShortcutKbd shortcut="findContext" isMac={isMac} />
      </Button>
    ) : null;

    const intelligencePanel = (
      <ContentEditorIntelligencePanel
        intelligence={intelligence}
        segmentId={segment.id}
        segmentKey={segment.key}
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
        showMaxLengthEditor={showMaxLengthEditor}
        isMaxLengthSaving={isMaxLengthSaving}
        canEditTranslations={canEditTranslations}
        isTranslationLocked={Boolean(segment.isLocked)}
        canLookupFreshContext={canLookupFreshContext}
        onRefreshContext={onRefreshContext}
        onUseTmMatch={onUseTmMatch}
        onSetMaxLength={segment.isLocked ? undefined : onSetMaxLength}
        onGlossaryTermAdded={onGlossaryTermAdded}
        headerAction={findContextButton}
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

      return (
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setTabState({ tab: value as DetailsTab, revealNonce: qaDetailsRevealNonce })
          }
          className={cn("h-full min-h-0 gap-0 border-l border-border bg-background", className)}
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-2">
            <TabsList variant="line" className="h-10">
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
            </TabsList>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ms-auto size-8 shrink-0"
              aria-label={intl.formatMessage(contentEditorWorkspaceViewMessages.hideDetailsPanel)}
              onClick={() => workspace.ui.setDetailsPanelCollapsed(true)}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
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
                  {commentsPanel}
                </Box>
              </div>
            </Column>
          </Columns>
        </div>
      </div>
    );
  },
);

type DetailsTab = "details" | "qa" | "comments";

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
