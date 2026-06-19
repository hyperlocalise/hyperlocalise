import type {
  CatFormatCheck,
  CatGlossaryTerm,
  CatSegment,
  CatSegmentIntelligence,
  CatSegmentStatus,
  CatTranslationMemoryMatch,
  CatWorkspaceState,
} from "./types";
import type { CatQueueFilter } from "./cat-queue-filter";

export interface CatAiRecommendationResult {
  aiSuggestion: string;
  aiReasoning?: string;
  formatChecks?: CatFormatCheck[];
}

export interface CatSegmentConcordanceResult {
  glossaryTerms: CatGlossaryTerm[];
  translationMemoryMatches: CatTranslationMemoryMatch[];
}

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
}

export interface CatWorkspaceReview {
  onApprove: (
    segmentId: string,
    targetText: string,
  ) => void | CatSegmentStatus | Promise<void | CatSegmentStatus>;
  onAddComment?: (segmentId: string, text: string) => void | Promise<void>;
  onAskQuestion: (segmentId: string) => void | Promise<void>;
  onReviewWithAi: (segmentId: string) => void | Promise<void>;
  onSkip: (segmentId: string) => void;
  onBulkApprove?: (segmentIds: string[]) => void | Promise<void>;
  onBulkSkip?: (segmentIds: string[]) => void | Promise<void>;
}

export interface CatWorkspaceServices {
  validateFormat?: (segment: CatSegment, value: string) => Promise<CatFormatCheck[]>;
  runQaChecks?: (segment: CatSegment, value: string) => Promise<CatFormatCheck[]>;
  lookupSegmentContext?: (segment: CatSegment) => Promise<string>;
  lookupSegmentConcordance?: (segment: CatSegment) => Promise<CatSegmentConcordanceResult>;
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

export interface CatWorkspaceViewProps {
  state: CatWorkspaceState;
  dependencies: CatWorkspaceDependencies;
  isValidating?: boolean;
  isApproving?: boolean;
  isPostingComment?: boolean;
  commentPostError?: string;
  isLookingUpContext?: boolean;
  isConcordanceLoading?: boolean;
  isAiSuggestionLoading?: boolean;
  isFormatChecksLoading?: boolean;
  canLookupContext?: boolean;
  canUseAiRecommendation?: boolean;
  showAgentContext?: boolean;
  dirtySegmentIds?: ReadonlySet<string>;
  className?: string;
  queueSearch?: string;
  onQueueSearchChange?: (value: string) => void;
  isQueueSearchPending?: boolean;
  isQueueFetchingPage?: boolean;
  queuePagination?: {
    offset: number;
    limit: number;
    returnedCount: number;
    totalCount: number;
    hasMore: boolean;
  } | null;
  onQueuePreviousPage?: () => void;
  onQueueNextPage?: () => void;
  onQueueNearEnd?: () => void;
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
  editorState?: CatWorkspaceState;
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
  },
  review: {
    onApprove: () => undefined,
    onAskQuestion: () => undefined,
    onReviewWithAi: () => undefined,
    onSkip: () => undefined,
  },
};
