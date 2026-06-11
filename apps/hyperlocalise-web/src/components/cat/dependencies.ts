import type { CatFormatCheck, CatSegment, CatSegmentStatus, CatWorkspaceState } from "./types";

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
  onAskQuestion: (segmentId: string) => void | Promise<void>;
  onSkip: (segmentId: string) => void;
}

export interface CatWorkspaceServices {
  validateFormat?: (segment: CatSegment, value: string) => Promise<CatFormatCheck[]>;
  runQaChecks?: (segment: CatSegment, value: string) => Promise<CatFormatCheck[]>;
  lookupSegmentContext?: (segment: CatSegment) => Promise<string>;
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
  isBusy?: boolean;
  className?: string;
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
    onSkip: () => undefined,
  },
};
