import type { CatVisualContext } from "@/lib/translation/cat-visual-context";
import type {
  CatFormatCheck,
  CatGlossaryTerm,
  CatSegment,
  CatSegmentCommentInput,
  CatSegmentIntelligence,
  CatSegmentStatus,
  CatTranslationMemoryMatch,
  CatWorkspaceShell,
} from "./types";
import type { CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";

export interface CatAiRecommendationResult {
  aiSuggestion: string;
  aiReasoning?: string;
  formatChecks?: CatFormatCheck[];
}

export interface CatSegmentConcordanceResult {
  glossaryTerms: CatGlossaryTerm[];
  translationMemoryMatches: CatTranslationMemoryMatch[];
}

export type CatSegmentVisualContextResult = CatVisualContext;

export interface CatWorkspaceNavigation {
  onSelectSegment: (segmentId: string) => void;
  onPreviousSegment: () => void;
  onNextSegment: () => void;
  onReviewInSequence: () => void;
}

export interface CatWorkspaceEditing {
  onTargetChange: (segmentId: string, value: string) => void;
  onUseAiSuggestion: (segmentId: string) => void;
  onUseTmMatch: (segmentId: string, match: CatTranslationMemoryMatch) => void;
  onUseGlossaryTerm: (segmentId: string, term: CatGlossaryTerm, sourceText: string) => void;
}

export interface CatWorkspaceReview {
  onApprove: (
    segmentId: string,
    targetText: string,
  ) => void | CatSegmentStatus | Promise<void | CatSegmentStatus>;
  onSaveDraft?: (
    segmentId: string,
    targetText: string,
  ) => void | CatSegmentStatus | Promise<void | CatSegmentStatus>;
  onAddComment?: (segmentId: string, input: CatSegmentCommentInput) => void | Promise<void>;
  onResolveComment?: (segmentId: string, commentId: string) => void | Promise<void>;
  onAskQuestion: (segmentId: string, options?: { forceRefresh?: boolean }) => void | Promise<void>;
  onReviewWithAi: (segmentId: string) => void | Promise<void>;
  onSkip: (segmentId: string) => void;
  onBulkApprove?: (segmentIds: string[]) => void | Promise<void>;
  onBulkSkip?: (segmentIds: string[]) => void | Promise<void>;
}

export interface CatWorkspaceServices {
  validateFormat?: (
    segment: CatSegment,
    value: string,
    glossaryTerms?: CatGlossaryTerm[],
  ) => Promise<CatFormatCheck[]>;
  runQaChecks?: (segment: CatSegment, value: string) => Promise<CatFormatCheck[]>;
  lookupSegmentContext?: (
    segment: CatSegment,
    options?: { cachedOnly?: boolean; forceRefresh?: boolean },
  ) => Promise<string | null>;
  lookupSegmentConcordance?: (segment: CatSegment) => Promise<CatSegmentConcordanceResult>;
  lookupSegmentVisualContext?: (segment: CatSegment) => Promise<CatSegmentVisualContextResult>;
  generateAiRecommendation?: (
    segment: CatSegment,
    targetText: string,
    intelligence?: CatSegmentIntelligence,
  ) => Promise<CatAiRecommendationResult>;
}

export interface CatWorkspaceDependencies {
  navigation: CatWorkspaceNavigation;
  editing: CatWorkspaceEditing;
  review: CatWorkspaceReview;
  services?: CatWorkspaceServices;
}

export type PartialCatWorkspaceDependencies = {
  navigation?: Partial<CatWorkspaceNavigation>;
  editing?: Partial<CatWorkspaceEditing>;
  review?: Partial<CatWorkspaceReview>;
  services?: CatWorkspaceServices;
};

export type { CatWorkspaceShell };

export interface CatWorkspaceViewProps {
  shell: CatWorkspaceShell;
  queueSegments: CatSegment[];
  selectedSegment: CatSegment | null;
  dependencies: CatWorkspaceDependencies;
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
  dirtySegmentIds?: ReadonlySet<string>;
  className?: string;
  queueSearch?: string;
  onQueueSearchChange?: (value: string) => void;
  isQueueSearchPending?: boolean;
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
  queueFilter?: CatQueueFilter;
  onQueueFilterChange?: (filter: CatQueueFilter) => void;
  availableQueueFilters?: CatQueueFilter[];
  checkedSegmentIds?: ReadonlySet<string>;
  onToggleSegmentChecked?: (segmentId: string, checked: boolean) => void;
  onSelectAllVisible?: () => void;
  onClearChecked?: () => void;
  onBulkApprove?: () => void;
  onBulkSkip?: () => void;
  isBulkActionPending?: boolean;
  buildSegmentShareUrl?: (segment: CatSegment) => string | null;
  onIntelligencePanelVisible?: (segmentId: string) => void;
}

export const noopCatDependencies: CatWorkspaceDependencies = {
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
    onUseGlossaryTerm: () => undefined,
  },
  review: {
    onApprove: () => undefined,
    onAskQuestion: () => undefined,
    onReviewWithAi: () => undefined,
    onSkip: () => undefined,
  },
};
