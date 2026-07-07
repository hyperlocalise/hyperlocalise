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
};
