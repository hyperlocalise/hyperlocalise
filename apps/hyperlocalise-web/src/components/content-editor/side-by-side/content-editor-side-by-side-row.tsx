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
import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { SegmentActivityButton } from "../activity-log/content-editor-segment-activity";

import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
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

import { ContentEditorSideBySideAiSuggestion } from "./content-editor-side-by-side-ai-suggestion";
import { ContentEditorSideBySideInlineQa } from "./content-editor-side-by-side-inline-qa";
import {
  actionableFormatChecks,
  qaHighlightTokens,
  replacesQaTermAsWholeWord,
} from "./content-editor-side-by-side-qa";
import { ContentEditorSideBySideQaStatus } from "./content-editor-side-by-side-qa-status";

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
    <Box display="flex" flexWrap="wrap" alignItems="center" gap="0.5u">
      {isTargetLoading || !shouldShowSegmentStatusBadge(segment.status, segment.isHidden) ? null : (
        <SegmentStatusBadge status={segment.status} />
      )}
      {segment.isHidden ? <ContentEditorHiddenStringBadge /> : null}
      {segment.isLocked ? <ContentEditorLockedStringBadge /> : null}
      {segmentTags.length > 0 ? <ContentEditorSegmentTags tags={segmentTags} /> : null}
    </Box>
  );
  const sourceKeyMeta = (
    <Rows spacing="0.5u">
      <ContentEditorSegmentKeyMeta
        segmentKey={segment.key}
        sourcePath={segment.sourcePath}
        trailing={shareButton}
      />
      {statusAndTags}
    </Rows>
  );
  const copyClearActions = showCopyClearActions ? (
    <Box display="flex" alignItems="center" gap="0.5u">
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
    </Box>
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
    <Box display="flex" flexWrap="wrap" alignItems="center" gap="0.5u">
      <SegmentActivityButton
        segmentId={segment.id}
        sourcePath={segment.sourcePath}
        targetLocale={segment.targetLocale}
        label={segment.key}
      />
      {showReviewActions ? (
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
              variant="ghost"
              size="xs"
              onClick={onSaveDraft}
              disabled={!canTriggerApprove}
            >
              {isSavingDraft ? <Spinner className="size-3" /> : null}
              <FormattedMessage {...contentEditorEditorPanelMessages.draftAction} />
            </Button>
          ) : null}
        </>
      ) : null}
      {showIssueSheetAction ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onAddToIssueSheet}
          disabled={isActionBlocked}
        >
          <FormattedMessage {...contentEditorEditorPanelMessages.queryAction} />
        </Button>
      ) : null}
    </Box>
  ) : null;

  return (
    <div
      className={cn(
        "border-b border-border transition-colors",
        isActive && "bg-grove-500/5",
        isFocused && "ring-1 ring-inset ring-grove-400/30",
      )}
      onMouseEnter={() => setIsPointerHovered(true)}
      onMouseLeave={() => setIsPointerHovered(false)}
      onFocus={onFocus}
    >
      <Columns spacing="0">
        <Column width="1/2">
          <div className="h-full border-r border-border">
            <Box paddingX="1.5u" paddingY="1u">
              {isFocused && showVideoSource ? (
                <Rows spacing="1.5u">
                  <ContentEditorEditorVideoSourceSection
                    segment={segment}
                    canEdit={canEditTarget}
                    isBusy={isImageBusy}
                    onTreatAsVideo={onTreatAsVideo}
                    onRegenerate={onRegenerateImage}
                  />
                  <Row spacing="1u" align="spaceBetween" alignY="start">
                    {statusAndTags}
                    {shareButton}
                  </Row>
                  {copyClearActions}
                </Rows>
              ) : isFocused && showImageSource ? (
                <Rows spacing="1.5u">
                  <ContentEditorEditorImageSourceSection
                    segment={segment}
                    canEdit={canEditTarget}
                    isBusy={isImageBusy}
                    onTreatAsImage={onTreatAsImage}
                    onRegenerate={onRegenerateImage}
                  />
                  <Row spacing="1u" align="spaceBetween" alignY="start">
                    {statusAndTags}
                    {shareButton}
                  </Row>
                  {copyClearActions}
                </Rows>
              ) : isVideoSegment ? (
                <Rows spacing="1.5u">
                  <button type="button" className="w-full text-left" onClick={onFocus}>
                    <Rows spacing="1.5u">
                      <ContentEditorVideoPreview
                        src={
                          segment.contentKind === "video_file"
                            ? segment.sourceAssetUrl
                            : (segment.sourceAssetUrl ?? segment.sourceText)
                        }
                        emptyLabel={intl.formatMessage(
                          contentEditorEditorPanelMessages.videoSourceEmpty,
                        )}
                        className="min-h-24"
                      />
                      {sourceKeyMeta}
                    </Rows>
                  </button>
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
                </Rows>
              ) : isImageSegment ? (
                <Rows spacing="1.5u">
                  <button type="button" className="w-full text-left" onClick={onFocus}>
                    <Rows spacing="1.5u">
                      <ContentEditorImagePreview
                        src={
                          segment.contentKind === "image_file"
                            ? segment.sourceAssetUrl
                            : (segment.sourceAssetUrl ?? segment.sourceText)
                        }
                        alt={intl.formatMessage(contentEditorEditorPanelMessages.imageSourceAlt)}
                        emptyLabel={intl.formatMessage(
                          contentEditorEditorPanelMessages.imageSourceEmpty,
                        )}
                        className="min-h-24"
                      />
                      {sourceKeyMeta}
                    </Rows>
                  </button>
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
                </Rows>
              ) : (
                <Rows spacing="1u">
                  <Text size="small" wrapStyle="pretty">
                    <ContentEditorMessagePreview message={segment.sourceText} />
                  </Text>
                  {sourceKeyMeta}
                  {copyClearActions || showTreatAsImageAction || showTreatAsVideoAction ? (
                    <Box display="flex" flexWrap="wrap" alignItems="center" gap="0.5u">
                      {copyClearActions}
                      {showTreatAsImageAction ? (
                        <Button
                          type="button"
                          variant={treatAsImage ? "secondary" : "outline"}
                          size="xs"
                          disabled={!canEditTarget || isImageBusy}
                          onClick={() => onTreatAsImage?.(!treatAsImage)}
                          title={intl.formatMessage(
                            contentEditorEditorPanelMessages.treatAsImageTitle,
                          )}
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
                          title={intl.formatMessage(
                            contentEditorEditorPanelMessages.treatAsVideoTitle,
                          )}
                        >
                          <HugeiconsIcon icon={Video01Icon} className="size-3" aria-hidden />
                          <FormattedMessage
                            {...(treatAsVideo
                              ? contentEditorEditorPanelMessages.treatAsText
                              : contentEditorEditorPanelMessages.treatAsVideo)}
                          />
                        </Button>
                      ) : null}
                    </Box>
                  ) : null}
                </Rows>
              )}
            </Box>
          </div>
        </Column>

        <Column width="1/2">
          <div className="relative min-w-0">
            <Box paddingX="1.5u" paddingY="1u">
              <Columns spacing="1u" alignY="start">
                <Column width="fluid">
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
                      <Rows spacing="1u">
                        <Rows spacing="0.5u">
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
                          {showAiSuggestion && intelligence && onUseAiSuggestion ? (
                            <ContentEditorSideBySideAiSuggestion
                              key={segment.id}
                              intelligence={intelligence}
                              isLoading={isAiSuggestionLoading}
                              error={aiRecommendationError}
                              onUseAiSuggestion={onUseAiSuggestion}
                              onGenerateAiRecommendation={onGenerateAiRecommendation}
                            />
                          ) : null}
                          {sourceMessageAnalysis ? (
                            <ContentEditorIcuStructureSummary
                              blocks={sourceMessageAnalysis.icuBlocks}
                            />
                          ) : null}
                        </Rows>
                        {reviewActions}
                      </Rows>
                    )
                  ) : (
                    <button
                      type="button"
                      className="w-full bg-transparent text-left"
                      onClick={onFocus}
                    >
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
                            <HugeiconsIcon icon={Video01Icon} className="size-4" aria-hidden />
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
                            alt={intl.formatMessage(
                              contentEditorEditorPanelMessages.imageTargetAlt,
                            )}
                            emptyLabel={intl.formatMessage(
                              contentEditorEditorPanelMessages.imageTargetEmpty,
                            )}
                            className="min-h-24"
                          />
                        ) : (
                          <Row spacing="1u" alignY="center">
                            <HugeiconsIcon icon={Image01Icon} className="size-4" aria-hidden />
                            <Text size="small" tone="subtle">
                              <FormattedMessage
                                {...contentEditorSideBySidePanelMessages.clickToLocalizeImage}
                              />
                            </Text>
                          </Row>
                        )
                      ) : isTargetLoading && !segment.targetText.trim() ? (
                        <Skeleton className="h-6 w-3/4 rounded-full" />
                      ) : segment.targetText.trim() ? (
                        <Text size="small" wrapStyle="pretty">
                          <ContentEditorMessagePreview
                            message={segment.targetText}
                            highlightTokens={highlightTokens}
                            highlightStatus={highlightStatus}
                            highlightWholeTerm={highlightWholeTerm}
                          />
                        </Text>
                      ) : (
                        <Row spacing="1u" alignY="center">
                          <HugeiconsIcon icon={TranslateIcon} className="size-4" aria-hidden />
                          <Text size="small" tone="subtle">
                            <FormattedMessage
                              defaultMessage="Click to translate"
                              id="G3IbmWT2r1"
                              description="Placeholder when a side-by-side row has no translation yet"
                            />
                          </Text>
                        </Row>
                      )}
                    </button>
                  )}
                </Column>
                {showCollapsedQaStatus ? (
                  <Column width="content">
                    <ContentEditorSideBySideQaStatus
                      formatChecks={formatChecks}
                      isLoading={isFormatChecksLoading}
                      onActivate={onFocus}
                    />
                  </Column>
                ) : null}
              </Columns>
            </Box>
            {isDirty ? (
              <span
                className="absolute right-2 bottom-2 size-1.5 rounded-full bg-bud-400"
                aria-hidden
              />
            ) : null}
          </div>
        </Column>
      </Columns>
    </div>
  );
});
