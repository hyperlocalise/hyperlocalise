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
  Copy01Icon,
  EraserIcon,
  Image01Icon,
  TranslateIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";
import { useAiFeaturesUpgradeHref } from "@/lib/billing/ai-features-upgrade-href";

import { ContentEditorEditorAiRecommendation } from "@/components/content-editor/editor/content-editor-editor-ai-recommendation";
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
import { ContentEditorShareSegmentButton } from "@/components/content-editor/segment/content-editor-share-segment-button";
import {
  contentEditorEditorPanelMessages,
  contentEditorSideBySidePanelMessages,
} from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";

import { ContentEditorSideBySideFormatCheckIcon } from "./content-editor-side-by-side-format-check-icon";
import { ContentEditorSideBySideFormatChecksReveal } from "./content-editor-side-by-side-format-checks-reveal";

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

export function ContentEditorSideBySideRow({
  segment,
  isFocused,
  isHovered,
  isDirty,
  canEdit,
  isTargetLoading,
  isApproving = false,
  isSavingDraft = false,
  isPostingComment = false,
  isLookingUpContext = false,
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
  onHover,
  onLeave,
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
  isHovered: boolean;
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
  onHover: () => void;
  onLeave: () => void;
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
  const resolvedPrimaryActionLabel =
    primaryActionLabel ?? intl.formatMessage(contentEditorEditorPanelMessages.approve);
  const isActive = isFocused || isHovered;
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
  const isActionBlocked =
    isApproving ||
    isSavingDraft ||
    isPostingComment ||
    isLookingUpContext ||
    isAiSuggestionLoading ||
    isFormatChecksLoading ||
    isTargetLoading ||
    isImageBusy;
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
  const showAiRecommendation =
    isFocused &&
    canEditTarget &&
    !isAssetSegment &&
    (canUseAiRecommendation || Boolean(upgradeHref)) &&
    Boolean(intelligence) &&
    Boolean(onUseAiSuggestion);
  const actionableFormatChecks = useMemo(
    () => formatChecks.filter((check) => check.status !== "pass"),
    [formatChecks],
  );
  const showFormatCheckIcon =
    !isAssetSegment && (isFormatChecksLoading || actionableFormatChecks.length > 0);
  const revealFormatChecks = showFormatCheckIcon && isActive;
  const showActionBar = showReviewActions || showIssueSheetAction;
  const copySourceLabel = intl.formatMessage(contentEditorEditorPanelMessages.copySource);
  const clearTargetLabel = intl.formatMessage(contentEditorEditorPanelMessages.clearTarget);
  const segmentTags = segment.tags ?? [];
  const showShareButton = isFocused && Boolean(segmentShareUrl);
  const shareButton =
    showShareButton && segmentShareUrl ? (
      <ContentEditorShareSegmentButton segmentShareUrl={segmentShareUrl} size="icon-xs" />
    ) : null;
  const statusAndTags = (
    <div className="flex flex-wrap items-center gap-1.5">
      {isTargetLoading || !shouldShowSegmentStatusBadge(segment.status, segment.isHidden) ? null : (
        <SegmentStatusBadge status={segment.status} />
      )}
      {segment.isHidden ? <ContentEditorHiddenStringBadge /> : null}
      {segment.isLocked ? <ContentEditorLockedStringBadge /> : null}
      {segmentTags.length > 0 ? <ContentEditorSegmentTags tags={segmentTags} /> : null}
    </div>
  );
  const sourceKeyMeta = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <ContentEditorSegmentKeyMeta
        segmentKey={segment.key}
        sourcePath={segment.sourcePath}
        trailing={shareButton}
      />
      {statusAndTags}
    </div>
  );
  const copyClearActions = showCopyClearActions ? (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => onTargetChange(segment.sourceText)}
        disabled={isTargetLoading}
        aria-label={copySourceLabel}
        title={copySourceLabel}
      >
        <HugeiconsIcon icon={Copy01Icon} aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => onTargetChange("")}
        disabled={isTargetLoading || segment.targetText.length === 0}
        aria-label={clearTargetLabel}
        title={clearTargetLabel}
      >
        <HugeiconsIcon icon={EraserIcon} aria-hidden />
      </Button>
    </div>
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

  const reviewActions = showActionBar ? (
    <div className="flex flex-wrap items-center gap-2">
      {showReviewActions ? (
        <>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 gap-1.5 px-2.5"
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
              className="h-8 gap-1.5 px-2.5"
              onClick={onSaveDraft}
              disabled={!canTriggerApprove}
            >
              {isSavingDraft ? <Spinner className="size-3.5" /> : null}
              <FormattedMessage {...contentEditorEditorPanelMessages.saveAsDraft} />
            </Button>
          ) : null}
        </>
      ) : null}
      {showIssueSheetAction ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5"
          onClick={onAddToIssueSheet}
          disabled={isActionBlocked}
        >
          <FormattedMessage {...contentEditorEditorPanelMessages.addToIssueSheet} />
        </Button>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-0 border-b border-border transition-colors",
        isActive && "bg-grove-500/5",
        isFocused && "ring-1 ring-inset ring-grove-400/30",
      )}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onFocus}
    >
      <div className={cn("min-w-0 border-r border-border px-4", isFocused ? "py-4" : "py-3")}>
        {isFocused && showVideoSource ? (
          <div className="space-y-2.5">
            <ContentEditorEditorVideoSourceSection
              segment={segment}
              canEdit={canEditTarget}
              isBusy={isImageBusy}
              onTreatAsVideo={onTreatAsVideo}
              onRegenerate={onRegenerateImage}
            />
            <div className="flex min-w-0 items-start justify-between gap-2">
              {statusAndTags}
              {shareButton}
            </div>
            {copyClearActions}
          </div>
        ) : isFocused && showImageSource ? (
          <div className="space-y-2.5">
            <ContentEditorEditorImageSourceSection
              segment={segment}
              canEdit={canEditTarget}
              isBusy={isImageBusy}
              onTreatAsImage={onTreatAsImage}
              onRegenerate={onRegenerateImage}
            />
            <div className="flex min-w-0 items-start justify-between gap-2">
              {statusAndTags}
              {shareButton}
            </div>
            {copyClearActions}
          </div>
        ) : isVideoSegment ? (
          <div className="space-y-2.5">
            <button type="button" className="w-full space-y-2.5 text-left" onClick={onFocus}>
              <ContentEditorVideoPreview
                src={
                  segment.contentKind === "video_file"
                    ? segment.sourceAssetUrl
                    : (segment.sourceAssetUrl ?? segment.sourceText)
                }
                emptyLabel={intl.formatMessage(contentEditorEditorPanelMessages.videoSourceEmpty)}
                className="min-h-24"
              />
              {sourceKeyMeta}
            </button>
            {showTreatAsVideoAction ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant={treatAsVideo ? "secondary" : "outline"}
                  size="xs"
                  disabled={!canEditTarget || isImageBusy}
                  onClick={() => onTreatAsVideo?.(!treatAsVideo)}
                  title={intl.formatMessage(contentEditorEditorPanelMessages.treatAsVideoTitle)}
                >
                  <HugeiconsIcon icon={Video01Icon} className="size-3" aria-hidden />
                  <FormattedMessage
                    {...(treatAsVideo
                      ? contentEditorEditorPanelMessages.treatAsText
                      : contentEditorEditorPanelMessages.treatAsVideo)}
                  />
                </Button>
              </div>
            ) : null}
          </div>
        ) : isImageSegment ? (
          <div className="space-y-2.5">
            <button type="button" className="w-full space-y-2.5 text-left" onClick={onFocus}>
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
              {sourceKeyMeta}
            </button>
            {showTreatAsImageAction ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant={treatAsImage ? "secondary" : "outline"}
                  size="xs"
                  disabled={!canEditTarget || isImageBusy}
                  onClick={() => onTreatAsImage?.(!treatAsImage)}
                  title={intl.formatMessage(contentEditorEditorPanelMessages.treatAsImageTitle)}
                >
                  <HugeiconsIcon icon={Image01Icon} className="size-3" aria-hidden />
                  <FormattedMessage
                    {...(treatAsImage
                      ? contentEditorEditorPanelMessages.treatAsText
                      : contentEditorEditorPanelMessages.treatAsImage)}
                  />
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm leading-relaxed text-foreground">
              <ContentEditorMessagePreview message={segment.sourceText} />
            </p>
            {sourceKeyMeta}
            {copyClearActions || showTreatAsImageAction || showTreatAsVideoAction ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {copyClearActions}
                {showTreatAsImageAction ? (
                  <Button
                    type="button"
                    variant={treatAsImage ? "secondary" : "outline"}
                    size="xs"
                    disabled={!canEditTarget || isImageBusy}
                    onClick={() => onTreatAsImage?.(!treatAsImage)}
                    title={intl.formatMessage(contentEditorEditorPanelMessages.treatAsImageTitle)}
                  >
                    <HugeiconsIcon icon={Image01Icon} className="size-3" aria-hidden />
                    <FormattedMessage
                      {...(treatAsImage
                        ? contentEditorEditorPanelMessages.treatAsText
                        : contentEditorEditorPanelMessages.treatAsImage)}
                    />
                  </Button>
                ) : null}
                {showTreatAsVideoAction ? (
                  <Button
                    type="button"
                    variant={treatAsVideo ? "secondary" : "outline"}
                    size="xs"
                    disabled={!canEditTarget || isImageBusy}
                    onClick={() => onTreatAsVideo?.(!treatAsVideo)}
                    title={intl.formatMessage(contentEditorEditorPanelMessages.treatAsVideoTitle)}
                  >
                    <HugeiconsIcon icon={Video01Icon} className="size-3" aria-hidden />
                    <FormattedMessage
                      {...(treatAsVideo
                        ? contentEditorEditorPanelMessages.treatAsText
                        : contentEditorEditorPanelMessages.treatAsVideo)}
                    />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className={cn("min-w-0 px-4", isFocused ? "py-4" : "py-2.5")}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {isFocused && canEdit ? (
              isVideoSegment ? (
                <div className="space-y-3.5">
                  <ContentEditorEditorVideoTargetSection
                    segment={segment}
                    canEdit={canEditTarget}
                    isBusy={isImageBusy}
                    isLoading={isTargetLoading}
                    onUpload={onUploadImage}
                    onRegenerate={onRegenerateImage}
                  />
                  {reviewActions}
                </div>
              ) : isImageSegment ? (
                <div className="space-y-3.5">
                  <ContentEditorEditorImageTargetSection
                    segment={segment}
                    canEdit={canEditTarget}
                    isBusy={isImageBusy}
                    isLoading={isTargetLoading}
                    onUpload={onUploadImage}
                    onRegenerate={onRegenerateImage}
                  />
                  {reviewActions}
                </div>
              ) : isTargetLoading && !segment.targetText.trim() ? (
                <Skeleton className="h-10 w-full rounded-lg" />
              ) : (
                <div className="space-y-3.5">
                  <ContentEditorTargetEditor
                    sourceText={segment.sourceText}
                    value={segment.targetText}
                    maxLength={segment.maxLength}
                    compact
                    onChange={onTargetChange}
                  />
                  {sourceMessageAnalysis ? (
                    <ContentEditorIcuStructureSummary blocks={sourceMessageAnalysis.icuBlocks} />
                  ) : null}
                  {showAiRecommendation && intelligence && onUseAiSuggestion ? (
                    <ContentEditorEditorAiRecommendation
                      intelligence={intelligence}
                      isLoading={isAiSuggestionLoading}
                      error={aiRecommendationError}
                      onUseAiSuggestion={onUseAiSuggestion}
                      onGenerateAiRecommendation={onGenerateAiRecommendation}
                    />
                  ) : null}
                  {reviewActions}
                </div>
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
                    <p className="flex items-center gap-2 text-sm text-muted-foreground italic">
                      <HugeiconsIcon icon={Video01Icon} className="size-4" aria-hidden />
                      <FormattedMessage
                        {...contentEditorSideBySidePanelMessages.clickToLocalizeVideo}
                      />
                    </p>
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
                    <p className="flex items-center gap-2 text-sm text-muted-foreground italic">
                      <HugeiconsIcon icon={Image01Icon} className="size-4" aria-hidden />
                      <FormattedMessage
                        {...contentEditorSideBySidePanelMessages.clickToLocalizeImage}
                      />
                    </p>
                  )
                ) : isTargetLoading && !segment.targetText.trim() ? (
                  <Skeleton className="h-6 w-3/4 rounded-full" />
                ) : segment.targetText.trim() ? (
                  <p className="text-sm leading-relaxed text-foreground">
                    <ContentEditorMessagePreview message={segment.targetText} />
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground italic">
                    <HugeiconsIcon icon={TranslateIcon} className="size-4" aria-hidden />
                    <FormattedMessage
                      defaultMessage="Click to translate"
                      id="G3IbmWT2r1"
                      description="Placeholder when a side-by-side row has no translation yet"
                    />
                  </p>
                )}
              </button>
            )}
          </div>
          {showFormatCheckIcon ? (
            <ContentEditorSideBySideFormatCheckIcon
              formatChecks={formatChecks}
              isLoading={isFormatChecksLoading}
              className="mt-0.5"
            />
          ) : null}
        </div>
        {showFormatCheckIcon ? (
          <ContentEditorSideBySideFormatChecksReveal
            open={revealFormatChecks}
            formatChecks={actionableFormatChecks}
            isLoading={isFormatChecksLoading}
          />
        ) : null}
        {isDirty ? (
          <span className="mt-2 inline-block size-1.5 rounded-full bg-bud-400" aria-hidden />
        ) : null}
      </div>
    </div>
  );
}
