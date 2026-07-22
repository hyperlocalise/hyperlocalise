"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { CopyIcon, EraserIcon, ImageIcon, LanguagesIcon } from "lucide-react";
import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import { CatEditorAiRecommendation } from "@/components/cat/editor/cat-editor-ai-recommendation";
import {
  CatEditorImageSourceSection,
  CatEditorImageTargetSection,
} from "@/components/cat/editor/cat-editor-image-sections";
import { CatEditorShortcutKbd } from "@/components/cat/editor/cat-editor-shortcut-kbd";
import { CatImagePreview } from "@/components/cat/editor/cat-image-preview";
import {
  CatIcuStructureSummary,
  CatMessagePreview,
  CatTargetEditor,
} from "@/components/cat/editor/cat-target-editor";
import { analyzeCatMessageFormat } from "@/components/cat/message-format/cat-message-format";
import { SegmentStatusBadge } from "@/components/cat/segment/cat-segment-status";
import { CatSegmentKeyMeta } from "@/components/cat/segment/cat-segment-key-meta";
import { CatSegmentTags } from "@/components/cat/segment/cat-segment-tags";
import { CatShareSegmentButton } from "@/components/cat/segment/cat-share-segment-button";
import {
  catEditorPanelMessages,
  catSideBySidePanelMessages,
} from "@/components/cat/shared/cat.messages";
import type {
  CatFormatCheck,
  CatSegment,
  CatSegmentIntelligence,
} from "@/components/cat/shared/types";

import { CatSideBySideFormatCheckIcon } from "./cat-side-by-side-format-check-icon";
import { CatSideBySideFormatChecksReveal } from "./cat-side-by-side-format-checks-reveal";

function isImageEditorSegment(segment: CatSegment) {
  return segment.contentKind === "image_file" || segment.contentKind === "image_url";
}

function hasImageTarget(segment: CatSegment) {
  return Boolean(segment.targetAssetUrl || segment.targetText.trim());
}

export function CatSideBySideRow({
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
  onRegenerateImage,
  onUploadImage,
}: {
  segment: CatSegment;
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
  intelligence?: CatSegmentIntelligence | null;
  aiRecommendationError?: string;
  formatChecks?: CatFormatCheck[];
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
  onRegenerateImage?: () => void;
  onUploadImage?: (file: File) => void;
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const resolvedPrimaryActionLabel =
    primaryActionLabel ?? intl.formatMessage(catEditorPanelMessages.approve);
  const isActive = isFocused || isHovered;
  const isImageSegment = isImageEditorSegment(segment);
  const showImageSource = isImageSegment || Boolean(segment.looksLikeImageUrl);
  const sourceMessageAnalysis = useMemo(
    () => (isImageSegment ? null : analyzeCatMessageFormat(segment.sourceText)),
    [isImageSegment, segment.sourceText],
  );
  const hasApprovingTarget = isImageSegment
    ? hasImageTarget(segment)
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
  const canTriggerApprove = Boolean(onApprove) && canEdit && hasApprovingTarget && !isActionBlocked;
  const showReviewActions = isFocused && canEdit && Boolean(onApprove) && hasApprovingTarget;
  const showIssueSheetAction =
    isFocused && canEdit && !isImageSegment && Boolean(onAddToIssueSheet);
  const canEditTarget = canEdit && !isImageBusy;
  const showCopyClearActions = canEditTarget && !isImageSegment;
  const showTreatAsImageAction = Boolean(
    canEditTarget &&
    onTreatAsImage &&
    segment.contentKind !== "image_file" &&
    (segment.contentKind === "image_url" || segment.looksLikeImageUrl),
  );
  const treatAsImage = segment.contentKind === "image_url";
  const showAiRecommendation =
    isFocused &&
    canEditTarget &&
    !isImageSegment &&
    canUseAiRecommendation &&
    Boolean(intelligence) &&
    Boolean(onUseAiSuggestion);
  const actionableFormatChecks = useMemo(
    () => formatChecks.filter((check) => check.status !== "pass"),
    [formatChecks],
  );
  const showFormatCheckIcon =
    !isImageSegment && (isFormatChecksLoading || actionableFormatChecks.length > 0);
  const revealFormatChecks = showFormatCheckIcon && isActive;
  const showActionBar = showReviewActions || showIssueSheetAction;
  const copySourceLabel = intl.formatMessage(catEditorPanelMessages.copySource);
  const clearTargetLabel = intl.formatMessage(catEditorPanelMessages.clearTarget);
  const segmentTags = segment.tags ?? [];
  const showShareButton = isFocused && Boolean(segmentShareUrl);
  const shareButton =
    showShareButton && segmentShareUrl ? (
      <CatShareSegmentButton segmentShareUrl={segmentShareUrl} size="icon-xs" />
    ) : null;
  const statusAndTags = (
    <div className="flex flex-wrap items-center gap-1.5">
      {isTargetLoading ? null : <SegmentStatusBadge status={segment.status} />}
      {segmentTags.length > 0 ? <CatSegmentTags tags={segmentTags} /> : null}
    </div>
  );
  const sourceKeyMeta = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <CatSegmentKeyMeta
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
        <CopyIcon aria-hidden />
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
        <EraserIcon aria-hidden />
      </Button>
    </div>
  ) : null;

  useHotkeys(
    "mod+enter",
    (event) => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.dataset.catCommentInput === "true"
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
            <CatEditorShortcutKbd
              shortcut="approve"
              isMac={isMac}
              className="bg-primary-foreground/15 text-primary-foreground"
            />
          </Button>
          {onSaveDraft && !isImageSegment ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5"
              onClick={onSaveDraft}
              disabled={!canTriggerApprove}
            >
              {isSavingDraft ? <Spinner className="size-3.5" /> : null}
              <FormattedMessage {...catEditorPanelMessages.saveAsDraft} />
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
          <FormattedMessage {...catEditorPanelMessages.addToIssueSheet} />
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
        {isFocused && showImageSource ? (
          <div className="space-y-2.5">
            <CatEditorImageSourceSection
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
        ) : isImageSegment ? (
          <div className="space-y-2.5">
            <button type="button" className="w-full space-y-2.5 text-left" onClick={onFocus}>
              <CatImagePreview
                src={
                  segment.contentKind === "image_file"
                    ? segment.sourceAssetUrl
                    : (segment.sourceAssetUrl ?? segment.sourceText)
                }
                alt={intl.formatMessage(catEditorPanelMessages.imageSourceAlt)}
                emptyLabel={intl.formatMessage(catEditorPanelMessages.imageSourceEmpty)}
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
                  title={intl.formatMessage(catEditorPanelMessages.treatAsImageTitle)}
                >
                  <ImageIcon className="size-3" aria-hidden />
                  <FormattedMessage
                    {...(treatAsImage
                      ? catEditorPanelMessages.treatAsText
                      : catEditorPanelMessages.treatAsImage)}
                  />
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm leading-relaxed text-foreground">
              <CatMessagePreview message={segment.sourceText} />
            </p>
            {sourceKeyMeta}
            {copyClearActions || showTreatAsImageAction ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {copyClearActions}
                {showTreatAsImageAction ? (
                  <Button
                    type="button"
                    variant={treatAsImage ? "secondary" : "outline"}
                    size="xs"
                    disabled={!canEditTarget || isImageBusy}
                    onClick={() => onTreatAsImage?.(!treatAsImage)}
                    title={intl.formatMessage(catEditorPanelMessages.treatAsImageTitle)}
                  >
                    <ImageIcon className="size-3" aria-hidden />
                    <FormattedMessage
                      {...(treatAsImage
                        ? catEditorPanelMessages.treatAsText
                        : catEditorPanelMessages.treatAsImage)}
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
              isImageSegment ? (
                <div className="space-y-3.5">
                  <CatEditorImageTargetSection
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
                  <CatTargetEditor
                    sourceText={segment.sourceText}
                    value={segment.targetText}
                    maxLength={segment.maxLength}
                    compact
                    onChange={onTargetChange}
                  />
                  {sourceMessageAnalysis ? (
                    <CatIcuStructureSummary blocks={sourceMessageAnalysis.icuBlocks} />
                  ) : null}
                  {showAiRecommendation && intelligence && onUseAiSuggestion ? (
                    <CatEditorAiRecommendation
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
                {isImageSegment ? (
                  isTargetLoading && !hasImageTarget(segment) ? (
                    <Skeleton className="h-24 w-full rounded-lg" />
                  ) : hasImageTarget(segment) ? (
                    <CatImagePreview
                      src={
                        segment.targetAssetUrl ??
                        (segment.contentKind === "image_url" &&
                        /^https?:\/\//i.test(segment.targetText)
                          ? segment.targetText
                          : null)
                      }
                      alt={intl.formatMessage(catEditorPanelMessages.imageTargetAlt)}
                      emptyLabel={intl.formatMessage(catEditorPanelMessages.imageTargetEmpty)}
                      className="min-h-24"
                    />
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground italic">
                      <ImageIcon className="size-4" aria-hidden />
                      <FormattedMessage {...catSideBySidePanelMessages.clickToLocalizeImage} />
                    </p>
                  )
                ) : isTargetLoading && !segment.targetText.trim() ? (
                  <Skeleton className="h-6 w-3/4 rounded-full" />
                ) : segment.targetText.trim() ? (
                  <p className="text-sm leading-relaxed text-foreground">
                    <CatMessagePreview message={segment.targetText} />
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground italic">
                    <LanguagesIcon className="size-4" aria-hidden />
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
            <CatSideBySideFormatCheckIcon
              formatChecks={formatChecks}
              isLoading={isFormatChecksLoading}
              className="mt-0.5"
            />
          ) : null}
        </div>
        {showFormatCheckIcon ? (
          <CatSideBySideFormatChecksReveal
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
