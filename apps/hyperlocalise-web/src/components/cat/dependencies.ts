import type {
  CatFormatCheck,
  CatGlossaryTerm,
  CatSegment,
  CatSegmentIntelligence,
  CatSegmentStatus,
  CatTranslationMemoryMatch,
  CatWorkspaceState,
} from "./types";

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
  },
  review: {
    onApprove: () => undefined,
    onAskQuestion: () => undefined,
    onReviewWithAi: () => undefined,
    onSkip: () => undefined,
  },
};
