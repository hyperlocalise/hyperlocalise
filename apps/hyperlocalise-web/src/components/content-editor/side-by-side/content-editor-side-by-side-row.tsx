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
import {
  CopyIcon,
  EraserIcon,
  ImageIcon,
  FloppyDiskIcon,
  TranslateIcon,
  VideoIcon,
} from "@phosphor-icons/react";
import { observer } from "mobx-react-lite";
import { useMemo, useState, type ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { useSegmentActivityOpener } from "../activity-log/content-editor-segment-activity";
import {
  ContentEditorDifferentTranslationsBadge,
  ContentEditorGroupVariantsGate,
} from "../groups/content-editor-group-variants";
import { ContentEditorOccurrenceBadge } from "../groups/content-editor-occurrence-badge";
import { useHasGroupTranslationVariants } from "../groups/use-content-editor-group-variants";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Box } from "@/components/ui/layout/box";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/typography";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";
import { useAiFeaturesUpgradeHref } from "@/lib/billing/ai-features-upgrade-href";

import {
  ContentEditorEditorImageSourceSection,
  ContentEditorEditorImageTargetSection,
} from "@/components/content-editor/editor/content-editor-editor-image-sections";
import {
  ContentEditorEditorVideoSourceSection,
  ContentEditorEditorVideoTargetSection,
} from "@/components/content-editor/editor/content-editor-editor-video-sections";
import { ContentEditorEditorShortcutKbd } from "@/components/content-editor/editor/content-editor-editor-shortcut-kbd";
import { ContentEditorImagePreview } from "@/components/content-editor/editor/content-editor-image-preview";
import { ContentEditorVideoPreview } from "@/components/content-editor/editor/content-editor-video-preview";
import {
  ContentEditorIcuStructureSummary,
  ContentEditorMessagePreview,
  ContentEditorTargetEditor,
} from "@/components/content-editor/editor/content-editor-target-editor";
import { analyzeCatMessageFormat } from "@/components/content-editor/message-format/content-editor-message-format";
import { ContentEditorHiddenStringBadge } from "@/components/content-editor/segment/content-editor-hidden-string-badge";
import { ContentEditorLockedStringBadge } from "@/components/content-editor/segment/content-editor-locked-string-badge";
import {
  SegmentStatusBadge,
  shouldShowSegmentStatusBadge,
} from "@/components/content-editor/segment/content-editor-segment-status";
import { ContentEditorSegmentKeyMeta } from "@/components/content-editor/segment/content-editor-segment-key-meta";
import { ContentEditorSegmentTags } from "@/components/content-editor/segment/content-editor-segment-tags";
import { ContentEditorSegmentActionsMenu } from "@/components/content-editor/segment/content-editor-segment-actions-menu";
import {
  contentEditorEditorPanelMessages,
  contentEditorSideBySidePanelMessages,
} from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";

import { ContentEditorSideBySideAiSuggestion } from "./content-editor-side-by-side-ai-suggestion";
import {
  SIDE_BY_SIDE_GRID_CLASS_NAME,
  SIDE_BY_SIDE_SOURCE_AREA_CLASS_NAME,
  SIDE_BY_SIDE_STATUS_AREA_CLASS_NAME,
  SIDE_BY_SIDE_TARGET_AREA_CLASS_NAME,
} from "./content-editor-side-by-side-grid";
import { ContentEditorSideBySideInlineQa } from "./content-editor-side-by-side-inline-qa";
import {
  actionableFormatChecks,
  qaHighlightTokens,
  replacesQaTermAsWholeWord,
} from "./content-editor-side-by-side-qa";
import { ContentEditorSideBySideQaStatus } from "./content-editor-side-by-side-qa-status";

const CELL_BOX_CLASS_NAME = "rounded-md border border-border bg-background px-3 py-2";

function isImageEditorSegment(segment: ContentEditorSegment) {
  return segment.contentKind === "image_file" || segment.contentKind === "image_url";
}

function isVideoEditorSegment(segment: ContentEditorSegment) {
  return segment.contentKind === "video_file" || segment.contentKind === "video_url";
}

function isAssetEditorSegment(segment: ContentEditorSegment) {
  return isImageEditorSegment(segment) || isVideoEditorSegment(segment);
}

function hasAssetTarget(segment: ContentEditorSegment) {
  return Boolean(segment.targetAssetUrl || segment.targetText.trim());
}

export const ContentEditorSideBySideRow = observer(function ContentEditorSideBySideRow({
  segment,
  isFocused,
  isHovered,
  isDirty,
  canEdit,
  isTargetLoading,
  isApproving = false,
  isSavingDraft = false,
  isAiSuggestionLoading = false,
  isFormatChecksLoading = false,
  isImageBusy = false,
  canUseAiRecommendation = false,
  intelligence = null,
  aiRecommendationError,
  formatChecks = [],
  primaryActionLabel,
  segmentShareUrl = null,
  onFocus,
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
}: {
  segment: ContentEditorSegment;
  isFocused: boolean;
  isHovered?: boolean;
  isDirty: boolean;
  canEdit: boolean;
  isTargetLoading: boolean;
  isApproving?: boolean;
  isSavingDraft?: boolean;
  isPostingComment?: boolean;
  isLookingUpContext?: boolean;
  isAiSuggestionLoading?: boolean;
  isFormatChecksLoading?: boolean;
  isImageBusy?: boolean;
  canUseAiRecommendation?: boolean;
  intelligence?: ContentEditorSegmentIntelligence | null;
  aiRecommendationError?: string;
  formatChecks?: ContentEditorFormatCheck[];
  primaryActionLabel?: string;
  segmentShareUrl?: string | null;
  onFocus: () => void;
  onTargetChange: (value: string) => void;
  onApprove?: () => void;
  onSaveDraft?: () => void;
  onAddToIssueSheet?: () => void;
  onUseAiSuggestion?: () => void;
  onGenerateAiRecommendation?: () => void;
  onTreatAsImage?: (treatAsImage: boolean) => void;
  onTreatAsVideo?: (treatAsVideo: boolean) => void;
  onRegenerateImage?: () => void;
  onUploadImage?: (file: File) => void;
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const upgradeHref = useAiFeaturesUpgradeHref();
  const openActivity = useSegmentActivityOpener();
  const [isPointerHovered, setIsPointerHovered] = useState(false);
  const resolvedPrimaryActionLabel =
    primaryActionLabel ?? intl.formatMessage(contentEditorEditorPanelMessages.approve);
  const isActive = isFocused || (isHovered ?? isPointerHovered);
  const isImageSegment = isImageEditorSegment(segment);
  const isVideoSegment = isVideoEditorSegment(segment);
  const isAssetSegment = isAssetEditorSegment(segment);
  const showVideoSource = isVideoSegment || Boolean(segment.looksLikeVideoUrl);
  const showImageSource = isImageSegment || Boolean(segment.looksLikeImageUrl);
  const sourceMessageAnalysis = useMemo(
    () => (isAssetSegment ? null : analyzeCatMessageFormat(segment.sourceText)),
    [isAssetSegment, segment.sourceText],
  );
  const hasApprovingTarget = isAssetSegment
    ? hasAssetTarget(segment)
    : segment.targetText.trim().length > 0;
  const isActionBlocked = isApproving || isSavingDraft || isTargetLoading || isImageBusy;
  // Show Approve whenever the focused row has a target to approve — including clean
  // "Needs review" drafts (AI/job-written) that the reviewer has not edited yet.
  const canTriggerApprove =
    Boolean(onApprove) && canEdit && hasApprovingTarget && !isActionBlocked && !segment.isLocked;
  const showReviewActions =
    isFocused && canEdit && !segment.isLocked && Boolean(onApprove) && hasApprovingTarget;
  const showIssueSheetAction =
    isFocused && canEdit && !isAssetSegment && Boolean(onAddToIssueSheet);
  const canEditTarget = canEdit && !isImageBusy && !segment.isLocked;
  const showCopyClearActions = canEditTarget && !isAssetSegment;
  const showTreatAsImageAction = Boolean(
    canEditTarget &&
    onTreatAsImage &&
    segment.contentKind !== "image_file" &&
    segment.contentKind !== "video_file" &&
    segment.contentKind !== "video_url" &&
    (segment.contentKind === "image_url" || segment.looksLikeImageUrl),
  );
  const showTreatAsVideoAction = Boolean(
    canEditTarget &&
    onTreatAsVideo &&
    segment.contentKind !== "video_file" &&
    segment.contentKind !== "image_file" &&
    segment.contentKind !== "image_url" &&
    (segment.contentKind === "video_url" || segment.looksLikeVideoUrl),
  );
  const treatAsImage = segment.contentKind === "image_url";
  const treatAsVideo = segment.contentKind === "video_url";
  const showAiSuggestion =
    isFocused &&
    canEditTarget &&
    !isAssetSegment &&
    (canUseAiRecommendation || Boolean(upgradeHref)) &&
    Boolean(intelligence) &&
    Boolean(onUseAiSuggestion);
  const qaIssues = useMemo(() => actionableFormatChecks(formatChecks), [formatChecks]);
  const firstQaIssue = isFormatChecksLoading ? undefined : qaIssues[0];
  const highlightWholeTerm = replacesQaTermAsWholeWord(firstQaIssue);
  const highlightTokens = useMemo(
    () => qaHighlightTokens(firstQaIssue, segment.targetText),
    [firstQaIssue, segment.targetText],
  );
  const highlightStatus = firstQaIssue?.status === "fail" ? "fail" : "warn";
  const showCollapsedQaStatus =
    !isFocused && !isAssetSegment && (isFormatChecksLoading || formatChecks.length > 0);
  const showInlineQa =
    isFocused && !isAssetSegment && (isFormatChecksLoading || qaIssues.length > 0);
  const showStringMenu =
    isFocused && (Boolean(segmentShareUrl) || showIssueSheetAction || Boolean(openActivity));
  const showActionBar = showReviewActions || showStringMenu;
  const copySourceLabel = intl.formatMessage(contentEditorEditorPanelMessages.copySource);
  const clearTargetLabel = intl.formatMessage(contentEditorEditorPanelMessages.clearTarget);
  const segmentTags = segment.tags ?? [];
  const hasTranslationVariants = useHasGroupTranslationVariants(segment, segment.targetLocale);
  const statusBadges = (
    <Box display="flex" flexWrap="wrap" alignItems="center" gap="0.5u">
      {isTargetLoading || !shouldShowSegmentStatusBadge(segment.status, segment.isHidden) ? null : (
        <SegmentStatusBadge status={segment.status} />
      )}
      {hasTranslationVariants ? <ContentEditorDifferentTranslationsBadge /> : null}
      {segment.isHidden ? <ContentEditorHiddenStringBadge /> : null}
      {segment.isLocked ? <ContentEditorLockedStringBadge /> : null}
    </Box>
  );
  const showMediaSourceEditor = isFocused && (showVideoSource || showImageSource);
  const treatAsImageButton =
    showTreatAsImageAction && !showMediaSourceEditor ? (
      <Button
        type="button"
        variant={treatAsImage ? "secondary" : "outline"}
        size="xs"
        disabled={!canEditTarget || isImageBusy}
        onClick={() => onTreatAsImage?.(!treatAsImage)}
        title={intl.formatMessage(contentEditorEditorPanelMessages.treatAsImageTitle)}
      >
        <ImageIcon className="size-3" aria-hidden />
        <FormattedMessage
          {...(treatAsImage
            ? contentEditorEditorPanelMessages.treatAsText
            : contentEditorEditorPanelMessages.treatAsImage)}
        />
      </Button>
    ) : null;
  const treatAsVideoButton =
    showTreatAsVideoAction && !showMediaSourceEditor ? (
      <Button
        type="button"
        variant={treatAsVideo ? "secondary" : "outline"}
        size="xs"
        disabled={!canEditTarget || isImageBusy}
        onClick={() => onTreatAsVideo?.(!treatAsVideo)}
        title={intl.formatMessage(contentEditorEditorPanelMessages.treatAsVideoTitle)}
      >
        <VideoIcon className="size-3" aria-hidden />
        <FormattedMessage
          {...(treatAsVideo
            ? contentEditorEditorPanelMessages.treatAsText
            : contentEditorEditorPanelMessages.treatAsVideo)}
        />
      </Button>
    ) : null;
  const copyClearActions = showCopyClearActions ? (
    <TooltipProvider>
      <div
        className={cn(
          "flex items-center gap-0.5 transition-opacity",
          !isFocused && "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
        )}
      >
        <IconActionButton
          label={copySourceLabel}
          disabled={isTargetLoading}
          onClick={() => onTargetChange(segment.sourceText)}
        >
          <CopyIcon className="size-4" aria-hidden />
        </IconActionButton>
        <IconActionButton
          label={clearTargetLabel}
          disabled={isTargetLoading || segment.targetText.length === 0}
          onClick={() => onTargetChange("")}
        >
          <EraserIcon className="size-4" aria-hidden />
        </IconActionButton>
      </div>
    </TooltipProvider>
  ) : null;

  useHotkeys(
    "mod+enter",
    (event) => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.dataset.contentEditorCommentInput === "true"
      ) {
        return;
      }

      event.preventDefault();
      onApprove?.();
    },
    {
      enabled: isFocused && canTriggerApprove,
      enableOnFormTags: true,
      // TipTap uses contenteditable; without this, ⌘↵ / Ctrl+Enter is ignored while typing.
      enableOnContentEditable: true,
      preventDefault: true,
    },
    [canTriggerApprove, isFocused, onApprove],
  );

  const primaryActions = showReviewActions ? (
    <>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={onApprove}
        disabled={!canTriggerApprove}
      >
        {isApproving ? <Spinner className="size-3.5 text-primary-foreground" /> : null}
        {resolvedPrimaryActionLabel}
        <ContentEditorEditorShortcutKbd
          shortcut="approve"
          isMac={isMac}
          className="bg-primary-foreground/15 text-primary-foreground"
        />
      </Button>
      {onSaveDraft && !isAssetSegment ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSaveDraft}
          disabled={!canTriggerApprove}
        >
          {isSavingDraft ? <Spinner className="size-3" /> : <FloppyDiskIcon className="size-3.5" />}
          <FormattedMessage {...contentEditorEditorPanelMessages.draftAction} />
        </Button>
      ) : null}
    </>
  ) : null;
  const secondaryActions = showStringMenu ? (
    <ContentEditorSegmentActionsMenu
      segmentShareUrl={segmentShareUrl}
      onAddToIssueSheet={showIssueSheetAction ? onAddToIssueSheet : undefined}
      isAddToIssueSheetDisabled={isActionBlocked}
      activity={{
        segmentId: segment.id,
        sourcePath: segment.sourcePath,
        targetLocale: segment.targetLocale,
        label: segment.key,
      }}
    />
  ) : null;
  const renderTargetToolbar = (trigger: ReactNode) => {
    if (!trigger && !showActionBar) {
      return null;
    }

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {primaryActions}
        <div className="ms-auto flex items-center gap-0.5">
          {trigger}
          {secondaryActions}
        </div>
      </div>
    );
  };
  const reviewActions = renderTargetToolbar(null);

  return (
    <div
      className={cn(
        SIDE_BY_SIDE_GRID_CLASS_NAME,
        "group/row gap-y-2 border-b border-border px-4 py-3 transition-colors",
        isFocused ? "bg-primary/5" : isActive && "bg-muted/40",
      )}
      onMouseEnter={() => setIsPointerHovered(true)}
      onMouseLeave={() => setIsPointerHovered(false)}
      onFocus={onFocus}
    >
      <div className={SIDE_BY_SIDE_STATUS_AREA_CLASS_NAME}>{statusBadges}</div>

      <div className={SIDE_BY_SIDE_SOURCE_AREA_CLASS_NAME}>
        <Rows spacing="1u">
          {isFocused && showVideoSource ? (
            <ContentEditorEditorVideoSourceSection
              segment={segment}
              canEdit={canEditTarget}
              isBusy={isImageBusy}
              onTreatAsVideo={onTreatAsVideo}
              onRegenerate={onRegenerateImage}
            />
          ) : isFocused && showImageSource ? (
            <ContentEditorEditorImageSourceSection
              segment={segment}
              canEdit={canEditTarget}
              isBusy={isImageBusy}
              onTreatAsImage={onTreatAsImage}
              onRegenerate={onRegenerateImage}
            />
          ) : isVideoSegment ? (
            <button type="button" className="w-full text-left" onClick={onFocus}>
              <ContentEditorVideoPreview
                src={
                  segment.contentKind === "video_file"
                    ? segment.sourceAssetUrl
                    : (segment.sourceAssetUrl ?? segment.sourceText)
                }
                emptyLabel={intl.formatMessage(contentEditorEditorPanelMessages.videoSourceEmpty)}
                className="min-h-24"
              />
            </button>
          ) : isImageSegment ? (
            <button type="button" className="w-full text-left" onClick={onFocus}>
              <ContentEditorImagePreview
                src={
                  segment.contentKind === "image_file"
                    ? segment.sourceAssetUrl
                    : (segment.sourceAssetUrl ?? segment.sourceText)
                }
                alt={intl.formatMessage(contentEditorEditorPanelMessages.imageSourceAlt)}
                emptyLabel={intl.formatMessage(contentEditorEditorPanelMessages.imageSourceEmpty)}
                className="min-h-24"
              />
            </button>
          ) : (
            <div className={CELL_BOX_CLASS_NAME}>
              <Text size="small" wrapStyle="pretty">
                <ContentEditorMessagePreview message={segment.sourceText} />
              </Text>
            </div>
          )}
          <ContentEditorSegmentKeyMeta
            segmentKey={segment.key}
            sourcePath={segment.sourcePath}
            keyClassName="text-xs font-medium text-foreground"
            trailing={
              (segment.occurrenceCount ?? 0) > 1 ? (
                <ContentEditorOccurrenceBadge
                  count={segment.occurrenceCount!}
                  divergent={hasTranslationVariants}
                />
              ) : null
            }
          />
          {segmentTags.length > 0 ? <ContentEditorSegmentTags tags={segmentTags} /> : null}
          {copyClearActions || treatAsImageButton || treatAsVideoButton ? (
            <Box display="flex" flexWrap="wrap" alignItems="center" gap="0.5u">
              {copyClearActions}
              {treatAsImageButton}
              {treatAsVideoButton}
            </Box>
          ) : null}
        </Rows>
      </div>

      <div className={cn(SIDE_BY_SIDE_TARGET_AREA_CLASS_NAME, "relative")}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {isFocused && canEdit ? (
              isVideoSegment ? (
                <Rows spacing="1u">
                  <ContentEditorEditorVideoTargetSection
                    segment={segment}
                    canEdit={canEditTarget}
                    isBusy={isImageBusy}
                    isLoading={isTargetLoading}
                    onUpload={onUploadImage}
                    onRegenerate={onRegenerateImage}
                  />
                  {reviewActions}
                </Rows>
              ) : isImageSegment ? (
                <Rows spacing="1u">
                  <ContentEditorEditorImageTargetSection
                    segment={segment}
                    canEdit={canEditTarget}
                    isBusy={isImageBusy}
                    isLoading={isTargetLoading}
                    onUpload={onUploadImage}
                    onRegenerate={onRegenerateImage}
                  />
                  {reviewActions}
                </Rows>
              ) : isTargetLoading && !segment.targetText.trim() ? (
                <Skeleton className="h-10 w-full rounded-lg" />
              ) : (
                <ContentEditorGroupVariantsGate
                  segment={segment}
                  locale={segment.targetLocale}
                  ai={
                    intelligence && (canUseAiRecommendation || Boolean(upgradeHref))
                      ? {
                          intelligence,
                          isLoading: Boolean(isAiSuggestionLoading),
                          error: aiRecommendationError,
                          onGenerateAiRecommendation,
                        }
                      : undefined
                  }
                >
                  <Rows spacing="1.5u">
                    <ContentEditorTargetEditor
                      sourceText={segment.sourceText}
                      value={segment.targetText}
                      maxLength={segment.maxLength}
                      compact
                      highlightTokens={highlightTokens}
                      highlightStatus={highlightStatus}
                      highlightWholeTerm={highlightWholeTerm}
                      onChange={onTargetChange}
                    />
                    {showInlineQa ? (
                      <ContentEditorSideBySideInlineQa
                        formatChecks={formatChecks}
                        isLoading={isFormatChecksLoading}
                        targetText={segment.targetText}
                        onFix={onTargetChange}
                      />
                    ) : null}
                    {sourceMessageAnalysis ? (
                      <ContentEditorIcuStructureSummary blocks={sourceMessageAnalysis.icuBlocks} />
                    ) : null}
                    {showAiSuggestion && intelligence && onUseAiSuggestion ? (
                      <ContentEditorSideBySideAiSuggestion
                        key={segment.id}
                        intelligence={intelligence}
                        isLoading={isAiSuggestionLoading}
                        error={aiRecommendationError}
                        onUseAiSuggestion={onUseAiSuggestion}
                        onGenerateAiRecommendation={onGenerateAiRecommendation}
                        renderToolbar={renderTargetToolbar}
                      />
                    ) : (
                      renderTargetToolbar(null)
                    )}
                  </Rows>
                </ContentEditorGroupVariantsGate>
              )
            ) : (
              <button type="button" className="w-full bg-transparent text-left" onClick={onFocus}>
                {isVideoSegment ? (
                  isTargetLoading && !hasAssetTarget(segment) ? (
                    <Skeleton className="h-24 w-full rounded-lg" />
                  ) : hasAssetTarget(segment) ? (
                    <ContentEditorVideoPreview
                      src={
                        segment.targetAssetUrl ??
                        (segment.contentKind === "video_url" &&
                        /^https?:\/\//i.test(segment.targetText)
                          ? segment.targetText
                          : null)
                      }
                      emptyLabel={intl.formatMessage(
                        contentEditorEditorPanelMessages.videoTargetEmpty,
                      )}
                      className="min-h-24"
                    />
                  ) : (
                    <Row spacing="1u" alignY="center">
                      <VideoIcon className="size-4" aria-hidden />
                      <Text size="small" tone="subtle">
                        <FormattedMessage
                          {...contentEditorSideBySidePanelMessages.clickToLocalizeVideo}
                        />
                      </Text>
                    </Row>
                  )
                ) : isImageSegment ? (
                  isTargetLoading && !hasAssetTarget(segment) ? (
                    <Skeleton className="h-24 w-full rounded-lg" />
                  ) : hasAssetTarget(segment) ? (
                    <ContentEditorImagePreview
                      src={
                        segment.targetAssetUrl ??
                        (segment.contentKind === "image_url" &&
                        /^https?:\/\//i.test(segment.targetText)
                          ? segment.targetText
                          : null)
                      }
                      alt={intl.formatMessage(contentEditorEditorPanelMessages.imageTargetAlt)}
                      emptyLabel={intl.formatMessage(
                        contentEditorEditorPanelMessages.imageTargetEmpty,
                      )}
                      className="min-h-24"
                    />
                  ) : (
                    <Row spacing="1u" alignY="center">
                      <ImageIcon className="size-4" aria-hidden />
                      <Text size="small" tone="subtle">
                        <FormattedMessage
                          {...contentEditorSideBySidePanelMessages.clickToLocalizeImage}
                        />
                      </Text>
                    </Row>
                  )
                ) : isTargetLoading && !segment.targetText.trim() ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : segment.targetText.trim() ? (
                  <div className={CELL_BOX_CLASS_NAME}>
                    <Text size="small" wrapStyle="pretty">
                      <ContentEditorMessagePreview
                        message={segment.targetText}
                        highlightTokens={highlightTokens}
                        highlightStatus={highlightStatus}
                        highlightWholeTerm={highlightWholeTerm}
                      />
                    </Text>
                  </div>
                ) : (
                  <div className={cn(CELL_BOX_CLASS_NAME, "border-dashed")}>
                    <Row spacing="1u" alignY="center">
                      <TranslateIcon className="size-4" aria-hidden />
                      <Text size="small" tone="subtle">
                        <FormattedMessage
                          defaultMessage="Click to translate"
                          id="G3IbmWT2r1"
                          description="Placeholder when a side-by-side row has no translation yet"
                        />
                      </Text>
                    </Row>
                  </div>
                )}
              </button>
            )}
          </div>
          {showCollapsedQaStatus ? (
            <div className="shrink-0 pt-2">
              <ContentEditorSideBySideQaStatus
                formatChecks={formatChecks}
                isLoading={isFormatChecksLoading}
                onActivate={onFocus}
              />
            </div>
          ) : null}
        </div>
        {isDirty ? (
          <span
            className="absolute right-1 bottom-1 size-1.5 rounded-full bg-bud-400"
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
});

function IconActionButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
