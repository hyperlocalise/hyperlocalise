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
import { useMemo } from "react";
import { useIntl } from "react-intl";

import { useIsMac } from "@/hooks/use-is-mac";

import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";

import { ContentEditorEditorActions } from "./content-editor-editor-actions";
import { ContentEditorEditorAiRecommendation } from "./content-editor-editor-ai-recommendation";
import { ContentEditorEditorCommentsSection } from "./content-editor-editor-comments-section";
import { ContentEditorEditorFormatChecksSection } from "./content-editor-editor-format-checks-section";
import { ContentEditorEditorHeader } from "./content-editor-editor-header";
import { useContentEditorEditorHotkeys } from "./content-editor-editor-hotkeys";
import {
  ContentEditorEditorImageSourceSection,
  ContentEditorEditorImageTargetSection,
} from "./content-editor-editor-image-sections";
import {
  ContentEditorEditorVideoSourceSection,
  ContentEditorEditorVideoTargetSection,
} from "./content-editor-editor-video-sections";
import type { ContentEditorEditorPanelProps } from "./content-editor-editor-panel.types";
import { ContentEditorEditorSourceSection } from "./content-editor-editor-source-section";
import { ContentEditorEditorTargetSection } from "./content-editor-editor-target-section";

function isImageEditorSegment(segment: ContentEditorEditorPanelProps["segment"]) {
  return segment.contentKind === "image_file" || segment.contentKind === "image_url";
}

function isVideoEditorSegment(segment: ContentEditorEditorPanelProps["segment"]) {
  return segment.contentKind === "video_file" || segment.contentKind === "video_url";
}

function isAssetEditorSegment(segment: ContentEditorEditorPanelProps["segment"]) {
  return isImageEditorSegment(segment) || isVideoEditorSegment(segment);
}

export function ContentEditorEditorPanel({
  segment,
  segmentPosition,
  totalSegments,
  formatChecks,
  intelligence,
  isEditorBusy = false,
  isApproving = false,
  isSavingDraft = false,
  isLookingUpContext = false,
  isAiSuggestionLoading = false,
  isFormatChecksLoading = false,
  isCommentsLoading = false,
  isSegmentTargetLoading = false,
  isImageBusy = false,
  canApprove = true,
  canAddComment = false,
  canEditTranslations = true,
  canLookupContext = false,
  canUseAiRecommendation = false,
  isTargetDirty = false,
  isPostingComment = false,
  isResolvingComment = false,
  resolvingCommentId = null,
  commentPostError,
  providerKind = null,
  onTargetChange,
  onCopySource,
  onClearTarget,
  onUseAiSuggestion,
  onApprove,
  onSaveDraft,
  onAddComment,
  onAddToIssueSheet,
  onResolveComment,
  primaryActionLabel,
  onAskQuestion,
  onGenerateAiRecommendation,
  aiRecommendationError,
  onPrevious,
  onNext,
  hasPreviousSegment,
  hasNextSegment,
  segmentShareUrl = null,
  onTreatAsImage,
  onTreatAsVideo,
  onRegenerateImage,
  onUploadImage,
  onToggleLocked,
}: ContentEditorEditorPanelProps) {
  const intl = useIntl();
  const isMac = useIsMac();
  const resolvedPrimaryActionLabel =
    primaryActionLabel ?? intl.formatMessage(contentEditorEditorPanelMessages.approve);
  const supportsIssueComments = providerKind === "crowdin" && canAddComment;

  const actionState = useMemo(() => {
    const isActionBlocked =
      isApproving ||
      isSavingDraft ||
      isPostingComment ||
      isLookingUpContext ||
      isAiSuggestionLoading ||
      isFormatChecksLoading ||
      isSegmentTargetLoading ||
      isImageBusy;
    const hasTargetText = isAssetEditorSegment(segment)
      ? Boolean(segment.targetAssetUrl || segment.targetText.trim())
      : segment.targetText.trim().length > 0;

    return {
      canTriggerApprove: canApprove && hasTargetText && !isActionBlocked && !segment.isLocked,
      canTriggerFindContext:
        canLookupContext &&
        !isApproving &&
        !isSavingDraft &&
        !isLookingUpContext &&
        !isAiSuggestionLoading &&
        !isFormatChecksLoading &&
        !isImageBusy,
      canEditTarget: canEditTranslations && !isEditorBusy && !isImageBusy && !segment.isLocked,
    };
  }, [
    canApprove,
    canEditTranslations,
    canLookupContext,
    isAiSuggestionLoading,
    isApproving,
    isEditorBusy,
    isFormatChecksLoading,
    isImageBusy,
    isLookingUpContext,
    isPostingComment,
    isSavingDraft,
    isSegmentTargetLoading,
    segment,
  ]);

  useContentEditorEditorHotkeys({
    hasPreviousSegment,
    hasNextSegment,
    canTriggerApprove: actionState.canTriggerApprove,
    canTriggerFindContext: actionState.canTriggerFindContext,
    onPrevious,
    onNext,
    onApprove,
    onAskQuestion,
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ContentEditorEditorHeader
        segment={segment}
        segmentPosition={segmentPosition}
        totalSegments={totalSegments}
        isTargetDirty={isTargetDirty}
        segmentShareUrl={segmentShareUrl}
        hasPreviousSegment={hasPreviousSegment}
        hasNextSegment={hasNextSegment}
        isMac={isMac}
        onPrevious={onPrevious}
        onNext={onNext}
        canEditTranslations={canEditTranslations}
        onToggleLocked={onToggleLocked}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-6 lg:space-y-7 lg:px-8 lg:py-8">
          {isVideoEditorSegment(segment) || segment.looksLikeVideoUrl ? (
            <ContentEditorEditorVideoSourceSection
              segment={segment}
              canEdit={actionState.canEditTarget}
              isBusy={isImageBusy}
              onTreatAsVideo={
                onTreatAsVideo ? (treatAsVideo) => onTreatAsVideo(treatAsVideo) : undefined
              }
              onRegenerate={onRegenerateImage}
            />
          ) : isImageEditorSegment(segment) || segment.looksLikeImageUrl ? (
            <ContentEditorEditorImageSourceSection
              segment={segment}
              canEdit={actionState.canEditTarget}
              isBusy={isImageBusy}
              onTreatAsImage={
                onTreatAsImage ? (treatAsImage) => onTreatAsImage(treatAsImage) : undefined
              }
              onRegenerate={onRegenerateImage}
            />
          ) : (
            <ContentEditorEditorSourceSection
              sourceText={segment.sourceText}
              sourceLocale={segment.sourceLocale}
              segmentKey={segment.key}
              sourcePath={segment.sourcePath}
            />
          )}

          {isVideoEditorSegment(segment) ? (
            <ContentEditorEditorVideoTargetSection
              segment={segment}
              canEdit={actionState.canEditTarget}
              isBusy={isImageBusy}
              isLoading={isSegmentTargetLoading}
              onUpload={onUploadImage}
              onRegenerate={onRegenerateImage}
            />
          ) : isImageEditorSegment(segment) ? (
            <ContentEditorEditorImageTargetSection
              segment={segment}
              canEdit={actionState.canEditTarget}
              isBusy={isImageBusy}
              isLoading={isSegmentTargetLoading}
              onUpload={onUploadImage}
              onRegenerate={onRegenerateImage}
            />
          ) : (
            <ContentEditorEditorTargetSection
              segment={segment}
              canEditTarget={actionState.canEditTarget}
              isLoading={isSegmentTargetLoading}
              onTargetChange={onTargetChange}
              onCopySource={onCopySource}
              onClearTarget={onClearTarget}
            />
          )}

          <ContentEditorEditorActions
            primaryActionLabel={resolvedPrimaryActionLabel}
            isMac={isMac}
            canTriggerApprove={actionState.canTriggerApprove}
            canTriggerFindContext={actionState.canTriggerFindContext}
            canLookupContext={canLookupContext}
            isApproving={isApproving}
            isSavingDraft={isSavingDraft}
            isLookingUpContext={isLookingUpContext}
            hasPreviousSegment={hasPreviousSegment}
            hasNextSegment={hasNextSegment}
            onApprove={onApprove}
            onSaveDraft={isAssetEditorSegment(segment) ? undefined : onSaveDraft}
            onAddToIssueSheet={onAddToIssueSheet}
            onAskQuestion={onAskQuestion}
            onPrevious={onPrevious}
            onNext={onNext}
          />

          {canUseAiRecommendation && !isAssetEditorSegment(segment) ? (
            <ContentEditorEditorAiRecommendation
              intelligence={intelligence}
              isLoading={isAiSuggestionLoading}
              error={aiRecommendationError}
              onUseAiSuggestion={onUseAiSuggestion}
              onGenerateAiRecommendation={onGenerateAiRecommendation}
            />
          ) : null}

          {!isAssetEditorSegment(segment) ? (
            <ContentEditorEditorFormatChecksSection
              formatChecks={formatChecks}
              isLoading={isFormatChecksLoading}
            />
          ) : null}

          <ContentEditorEditorCommentsSection
            segment={segment}
            isLoading={isCommentsLoading}
            canAddComment={canAddComment}
            supportsIssueComments={supportsIssueComments}
            isPostingComment={isPostingComment}
            isResolvingComment={isResolvingComment}
            resolvingCommentId={resolvingCommentId}
            commentPostError={commentPostError}
            onAddComment={onAddComment}
            onOpenIssueSheet={onAddToIssueSheet}
            onResolveComment={onResolveComment}
          />
        </div>
      </div>
    </div>
  );
}

export type { ContentEditorEditorPanelProps } from "./content-editor-editor-panel.types";
