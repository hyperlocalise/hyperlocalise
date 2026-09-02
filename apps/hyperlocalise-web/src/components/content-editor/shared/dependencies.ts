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
import type { ContentEditorVisualContext } from "@/lib/translation/content-editor-visual-context";
import type {
  ContentEditorFormatCheck,
  ContentEditorGlossaryConcept,
  ContentEditorGlossaryTerm,
  ContentEditorSegment,
  ContentEditorSegmentCommentInput,
  ContentEditorSegmentIntelligence,
  ContentEditorSegmentStatus,
  ContentEditorTranslationMemoryMatch,
  ContentEditorWorkspaceShell,
} from "./types";
import type { ContentEditorQueueFilter } from "@/components/content-editor/queue/content-editor-queue-filter";

export interface ContentEditorAiRecommendationResult {
  aiSuggestion: string;
  aiReasoning?: string;
  formatChecks?: ContentEditorFormatCheck[];
}

export interface ContentEditorSegmentConcordanceResult {
  glossaryTerms: ContentEditorGlossaryTerm[];
  glossaryConcepts?: ContentEditorGlossaryConcept[];
  translationMemoryMatches: ContentEditorTranslationMemoryMatch[];
}

export type ContentEditorSegmentVisualContextResult = ContentEditorVisualContext;

export interface ContentEditorWorkspaceNavigation {
  onSelectSegment: (segmentId: string) => void;
  onPreviousSegment: () => void;
  onNextSegment: () => void;
  onReviewInSequence: () => void;
}

export interface ContentEditorWorkspaceEditing {
  onTargetChange: (segmentId: string, value: string) => void;
  onUseAiSuggestion: (segmentId: string) => void;
  onUseTmMatch: (segmentId: string, match: ContentEditorTranslationMemoryMatch) => void;
  onTreatAsImage?: (segmentId: string, treatAsImage: boolean) => void | Promise<void>;
  onTreatAsVideo?: (segmentId: string, treatAsVideo: boolean) => void | Promise<void>;
  onSetMaxLength?: (segmentId: string, maxLength: number | null) => void | Promise<void>;
  onRegenerateImage?: (
    segmentId: string,
    options?: { instructions?: string; force?: boolean },
  ) => void | Promise<void>;
  onUploadImage?: (segmentId: string, file: File) => void | Promise<void>;
}

export interface ContentEditorWorkspaceReview {
  onApprove: (
    segmentId: string,
    targetText: string,
  ) => void | ContentEditorSegmentStatus | Promise<void | ContentEditorSegmentStatus>;
  onSaveDraft?: (
    segmentId: string,
    targetText: string,
  ) => void | ContentEditorSegmentStatus | Promise<void | ContentEditorSegmentStatus>;
  onAddComment?: (
    segmentId: string,
    input: ContentEditorSegmentCommentInput,
  ) => void | Promise<void>;
  onAddToIssueSheet?: (segmentId: string) => void | Promise<void>;
  onResolveComment?: (segmentId: string, commentId: string) => void | Promise<void>;
  onAskQuestion: (segmentId: string, options?: { forceRefresh?: boolean }) => void | Promise<void>;
  onReviewWithAi: (segmentId: string) => void | Promise<void>;
  onSkip: (segmentId: string) => void;
  onBulkApprove?: (segmentIds: string[]) => void | Promise<void>;
  onBulkSkip?: (segmentIds: string[]) => void | Promise<void>;
  onBulkHide?: (segmentIds: string[]) => void | Promise<void>;
  onBulkUnhide?: (segmentIds: string[]) => void | Promise<void>;
  onSetLocked?: (segmentIds: string[], isLocked: boolean) => void | Promise<void>;
  onBulkLock?: (segmentIds: string[]) => void | Promise<void>;
  onBulkUnlock?: (segmentIds: string[]) => void | Promise<void>;
}

export interface ContentEditorWorkspaceServices {
  validateFormat?: (
    segment: ContentEditorSegment,
    value: string,
    glossaryTerms?: ContentEditorGlossaryTerm[],
    options?: { signal?: AbortSignal },
  ) => Promise<ContentEditorFormatCheck[]>;
  runQaChecks?: (
    segment: ContentEditorSegment,
    value: string,
  ) => Promise<ContentEditorFormatCheck[]>;
  lookupSegmentContext?: (
    segment: ContentEditorSegment,
    options?: { cachedOnly?: boolean; forceRefresh?: boolean },
  ) => Promise<string | null>;
  lookupSegmentConcordance?: (
    segment: ContentEditorSegment,
  ) => Promise<ContentEditorSegmentConcordanceResult>;
  lookupSegmentVisualContext?: (
    segment: ContentEditorSegment,
  ) => Promise<ContentEditorSegmentVisualContextResult>;
  generateAiRecommendation?: (
    segment: ContentEditorSegment,
    targetText: string,
    intelligence?: ContentEditorSegmentIntelligence,
  ) => Promise<ContentEditorAiRecommendationResult>;
}

export interface ContentEditorWorkspaceDependencies {
  navigation: ContentEditorWorkspaceNavigation;
  editing: ContentEditorWorkspaceEditing;
  review: ContentEditorWorkspaceReview;
  services?: ContentEditorWorkspaceServices;
}

export type PartialCatWorkspaceDependencies = {
  navigation?: Partial<ContentEditorWorkspaceNavigation>;
  editing?: Partial<ContentEditorWorkspaceEditing>;
  review?: Partial<ContentEditorWorkspaceReview>;
  services?: ContentEditorWorkspaceServices;
};

export type { ContentEditorWorkspaceShell };

export interface ContentEditorWorkspaceViewProps {
  shell: ContentEditorWorkspaceShell;
  queueSegments: ContentEditorSegment[];
  selectedSegment: ContentEditorSegment | null;
  dependencies: ContentEditorWorkspaceDependencies;
  isValidating?: boolean;
  isApproving?: boolean;
  isSavingDraft?: boolean;
  isPostingComment?: boolean;
  isResolvingComment?: boolean;
  resolvingCommentId?: string | null;
  commentPostError?: string;
  isLookingUpContext?: boolean;
  isConcordanceLoading?: boolean;
  isVisualContextLoading?: boolean;
  isAiSuggestionLoading?: boolean;
  isFormatChecksLoading?: boolean;
  canLookupContext?: boolean;
  canUseAiRecommendation?: boolean;
  showAgentContext?: boolean;
  showVisualContext?: boolean;
  revealedAgentContextSegmentIds?: ReadonlySet<string>;
  dirtySegmentIds?: ReadonlySet<string>;
  className?: string;
  queueSearch?: string;
  isQueueFetchingPage?: boolean;
  isQueueLoading?: boolean;
  queuePagination?: {
    offset: number;
    limit: number;
    returnedCount: number;
    totalCount: number;
    hasMore: boolean;
  } | null;
  hasMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
  isCommentsLoading?: boolean;
  isSegmentTargetLoading?: boolean;
  isImageBusy?: boolean;
  isMaxLengthSaving?: boolean;
  queueFilter?: ContentEditorQueueFilter;
  checkedSegmentIds?: ReadonlySet<string>;
  onToggleSegmentChecked?: (segmentId: string, checked: boolean) => void;
  buildSegmentShareUrl?: (segment: ContentEditorSegment) => string | null;
  onIntelligencePanelVisible?: (segmentId: string) => void;
  organizationSlug?: string;
  projectId?: string;
  nativeIssuesEnabled?: boolean;
  onReloadConcordance?: (segmentId: string) => void;
}

export const noopCatDependencies: ContentEditorWorkspaceDependencies = {
  navigation: {
    onSelectSegment: () => undefined,
    onPreviousSegment: () => undefined,
    onNextSegment: () => undefined,
    onReviewInSequence: () => undefined,
  },
  editing: {
    onTargetChange: () => undefined,
    onUseAiSuggestion: () => undefined,
    onUseTmMatch: () => undefined,
  },
  review: {
    onApprove: () => undefined,
    onAskQuestion: () => undefined,
    onReviewWithAi: () => undefined,
    onSkip: () => undefined,
  },
};
