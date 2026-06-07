import type { CatFormatCheck, CatSegment, CatSuggestion, CatWorkspaceState } from "./types";

export interface CatWorkspaceNavigation {
  onSelectSegment: (segmentId: string) => void;
  onPreviousSegment: () => void;
  onNextSegment: () => void;
  onReviewInSequence: () => void;
}

export interface CatWorkspaceEditing {
  onTargetChange: (segmentId: string, value: string) => void;
  onUseSuggestion: (segmentId: string, suggestion: CatSuggestion) => void;
  onUseAiSuggestion: (segmentId: string) => void;
}

export interface CatWorkspaceReview {
  onApprove: (segmentId: string) => void;
  onRequestChanges: (segmentId: string) => void;
  onAskQuestion: (segmentId: string) => void;
  onSkip: (segmentId: string) => void;
}

export interface CatWorkspaceToolbar {
  onRefresh?: () => void;
  onOpenExternal?: () => void;
  onRunWithAgent?: () => void;
}

export interface CatWorkspaceServices {
  validateFormat?: (segment: CatSegment, value: string) => Promise<CatFormatCheck[]>;
  runQaChecks?: (segment: CatSegment, value: string) => Promise<CatFormatCheck[]>;
}

export interface CatWorkspaceDependencies {
  navigation: CatWorkspaceNavigation;
  editing: CatWorkspaceEditing;
  review: CatWorkspaceReview;
  toolbar?: CatWorkspaceToolbar;
  services?: CatWorkspaceServices;
}

export type PartialCatWorkspaceDependencies = {
  navigation?: Partial<CatWorkspaceNavigation>;
  editing?: Partial<CatWorkspaceEditing>;
  review?: Partial<CatWorkspaceReview>;
  toolbar?: CatWorkspaceToolbar;
  services?: CatWorkspaceServices;
};

export interface CatWorkspaceViewProps {
  state: CatWorkspaceState;
  dependencies: CatWorkspaceDependencies;
  isBusy?: boolean;
  externalLinkLabel?: string;
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
    onUseSuggestion: () => undefined,
    onUseAiSuggestion: () => undefined,
  },
  review: {
    onApprove: () => undefined,
    onRequestChanges: () => undefined,
    onAskQuestion: () => undefined,
    onSkip: () => undefined,
  },
};
