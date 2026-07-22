/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type {
  CatFormatCheck,
  CatSegment,
  CatSegmentCommentInput,
  CatSegmentIntelligence,
} from "@/components/cat/shared/types";

export type CatEditorPanelProps = {
  segment: CatSegment;
  segmentPosition: number;
  totalSegments: number;
  formatChecks: CatFormatCheck[];
  intelligence: CatSegmentIntelligence;
  isEditorBusy?: boolean;
  isApproving?: boolean;
  isSavingDraft?: boolean;
  isLookingUpContext?: boolean;
  isAiSuggestionLoading?: boolean;
  isFormatChecksLoading?: boolean;
  isCommentsLoading?: boolean;
  isSegmentTargetLoading?: boolean;
  isImageBusy?: boolean;
  canApprove?: boolean;
  canAddComment?: boolean;
  canEditTranslations?: boolean;
  canLookupContext?: boolean;
  canUseAiRecommendation?: boolean;
  isTargetDirty?: boolean;
  isPostingComment?: boolean;
  isResolvingComment?: boolean;
  resolvingCommentId?: string | null;
  commentPostError?: string;
  onTargetChange: (value: string) => void;
  onCopySource: () => void;
  onClearTarget: () => void;
  onUseAiSuggestion: () => void;
  onApprove: () => void;
  onSaveDraft?: () => void;
  onAddComment?: (input: CatSegmentCommentInput) => void | Promise<void>;
  onAddToIssueSheet?: () => void | Promise<void>;
  onResolveComment?: (commentId: string) => void | Promise<void>;
  primaryActionLabel?: string;
  onAskQuestion: () => void;
  onGenerateAiRecommendation?: () => void;
  aiRecommendationError?: string;
  onPrevious: () => void;
  onNext: () => void;
  hasPreviousSegment: boolean;
  hasNextSegment: boolean;
  segmentShareUrl?: string | null;
  providerKind?: string | null;
  onTreatAsImage?: (treatAsImage: boolean) => void;
  onRegenerateImage?: () => void;
  onUploadImage?: (file: File) => void;
};
