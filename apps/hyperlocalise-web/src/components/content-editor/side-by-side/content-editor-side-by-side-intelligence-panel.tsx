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
import { useState, type ReactNode } from "react";
import {
  ChatCircleTextIcon,
  ClockCounterClockwiseIcon,
  LightbulbIcon,
  ListChecksIcon,
  TextAaIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Text } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";

import { ContentEditorSegmentActivityTab } from "@/components/content-editor/activity-log/content-editor-segment-activity-tab";
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
    onTmSegmentMutated,
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
    onTmSegmentMutated?: () => void;
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
        targetText={segment.targetText}
        sourceLocale={segment.sourceLocale}
        organizationSlug={organizationSlug}
        projectId={projectId}
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
        onTmSegmentMutated={onTmSegmentMutated}
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
      const activitySourcePath = segment.sourcePath ?? fileContext.sourcePath;
      const showActivityTab = Boolean(
        organizationSlug &&
        projectId &&
        activitySourcePath &&
        !isContentEditorAllFilesSourcePath(activitySourcePath),
      );
      const resolvedTab =
        (activeTab === "unicode" && !showUnicodeTab) ||
        (activeTab === "activity" && !showActivityTab)
          ? "details"
          : activeTab;
      const canInsertUnicode = canEditTranslations && !segment.isLocked;
      const tabLabels: Record<DetailsTab, string> = {
        details: intl.formatMessage(contentEditorSideBySidePanelMessages.detailsTab),
        qa: intl.formatMessage(contentEditorSideBySidePanelMessages.qaChecksTab),
        comments: intl.formatMessage(contentEditorSideBySidePanelMessages.commentsTab),
        unicode: intl.formatMessage(contentEditorUnicodePanelMessages.title),
        activity: intl.formatMessage(contentEditorSideBySidePanelMessages.activityTab),
      };

      return (
        <Tabs
          orientation="vertical"
          value={resolvedTab}
          onValueChange={(value) =>
            setTabState({ tab: value as DetailsTab, revealNonce: qaDetailsRevealNonce })
          }
          className={cn(
            "h-full min-h-0 flex-row gap-0 border-l border-border bg-background",
            className,
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border ps-3 pe-1">
              <Text
                size="xsmall"
                weight="medium"
                tone="subtle"
                className="truncate uppercase tracking-wide"
              >
                {tabLabels[resolvedTab]}
              </Text>
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

            <TabsContent
              value="comments"
              className="min-h-0 overflow-y-auto"
              data-inspector-comments
            >
              <Box paddingX="2u" paddingY="2u">
                {commentsPanel}
              </Box>
            </TabsContent>

            {showUnicodeTab ? (
              <TabsContent
                value="unicode"
                className="min-h-0 overflow-y-auto"
                data-inspector-unicode
              >
                <Box paddingX="2u" paddingY="2u">
                  <ContentEditorUnicodePanel
                    variant="tab"
                    canInsert={canInsertUnicode}
                    onInsertCharacter={onInsertCharacter}
                  />
                </Box>
              </TabsContent>
            ) : null}

            {showActivityTab && organizationSlug && projectId ? (
              <TabsContent
                value="activity"
                className="min-h-0 overflow-y-auto"
                data-inspector-activity
              >
                <Box paddingX="2u" paddingY="1u">
                  <ContentEditorSegmentActivityTab
                    key={`${segment.id}:${segment.targetLocale}`}
                    organizationSlug={organizationSlug}
                    projectId={projectId}
                    projectSource={
                      isNativeContentEditorProviderKind(fileContext.providerKind)
                        ? "native"
                        : "external_tms"
                    }
                    sourcePath={activitySourcePath}
                    segmentId={segment.id}
                    targetLocale={segment.targetLocale}
                  />
                </Box>
              </TabsContent>
            ) : null}
          </div>

          <TabsList
            variant="line"
            aria-label={intl.formatMessage(contentEditorSideBySidePanelMessages.detailsTabsLabel)}
            className="w-11 shrink-0 justify-start gap-1 border-s border-border bg-muted/40 px-1 py-2 group-data-vertical/tabs:h-full group-data-vertical/tabs:rounded-none"
          >
            <RailTab value="details" label={tabLabels.details} icon={LightbulbIcon} />
            <RailTab
              value="qa"
              label={tabLabels.qa}
              icon={ListChecksIcon}
              badge={qaIssueCount > 0 ? <TabCount count={qaIssueCount} tone="alert" /> : null}
            />
            <RailTab
              value="comments"
              label={tabLabels.comments}
              icon={ChatCircleTextIcon}
              badge={commentCount > 0 ? <TabCount count={commentCount} tone="count" /> : null}
            />
            {showUnicodeTab ? (
              <RailTab value="unicode" label={tabLabels.unicode} icon={TextAaIcon} />
            ) : null}
            {showActivityTab ? (
              <RailTab
                value="activity"
                label={tabLabels.activity}
                icon={ClockCounterClockwiseIcon}
              />
            ) : null}
          </TabsList>
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

type DetailsTab = "details" | "qa" | "comments" | "unicode" | "activity";

function RailTab({
  value,
  label,
  icon: Icon,
  badge,
}: {
  value: DetailsTab;
  label: string;
  icon: PhosphorIcon;
  badge?: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <TabsTrigger
            value={value}
            aria-label={label}
            className="size-9 flex-none rounded-lg after:hidden group-data-vertical/tabs:w-9 group-data-vertical/tabs:justify-center group-data-vertical/tabs:p-0 data-active:bg-background! data-active:shadow-xs data-active:ring-1 data-active:ring-border"
          />
        }
      >
        <Icon className="size-5" />
        {badge}
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function TabCount({ count, tone = "count" }: { count: number; tone?: "count" | "alert" }) {
  return (
    <span
      className={cn(
        "absolute -top-0.5 -end-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold tabular-nums",
        tone === "alert" ? "bg-destructive text-white" : "bg-foreground text-background",
      )}
    >
      {count}
    </span>
  );
}
