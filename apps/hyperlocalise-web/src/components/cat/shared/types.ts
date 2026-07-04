import type { CatVisualContext } from "@/lib/translation/cat-visual-context";

export type CatSegmentStatus = "pending" | "needs_review" | "reviewed" | "skipped";

export type CatTmMatchKind = "exact" | "context" | "fuzzy";

export type CatRiskLevel = "low" | "medium" | "high" | "good";

export type CatFormatCheckStatus = "pass" | "warn" | "fail";

export type CatSegmentCommentType = "comment" | "issue";

export type CrowdinIssueType =
  | "general_question"
  | "translation_mistake"
  | "context_request"
  | "source_mistake";

export interface CatSegmentCommentInput {
  text: string;
  type?: CatSegmentCommentType;
  issueType?: CrowdinIssueType;
}

export interface CatSegmentComment {
  id: string;
  type: CatSegmentCommentType;
  status: string | null;
  text: string;
  createdAt: string | null;
  locale: string | null;
  author?: string | null;
}

/** Queue list identity — no locale, target, or editor metadata. */
export interface CatQueueSegment {
  id: string;
  index: number;
  key: string;
  sourceText: string;
}

/** File and locale scope for the CAT editor, shared across all segments. */
export interface CatFileContext {
  sourcePath: string;
  filename: string;
  sourceLocale: string;
  targetLocale: string;
  providerKind: string | null;
  canEditTranslations: boolean;
  canAddComments: boolean;
  truncated?: boolean;
}

export interface CatSegment {
  id: string;
  index: number;
  key: string;
  sourceText: string;
  targetText: string;
  sourceLocale: string;
  targetLocale: string;
  contextLabel?: string;
  status: CatSegmentStatus;
  hasOpenIssues?: boolean;
  tags?: string[];
  maxLength?: number;
  comments?: CatSegmentComment[];
}

export interface CatFormatCheck {
  id: string;
  label: string;
  status: CatFormatCheckStatus;
  message: string;
  category?: "length" | "placeholder" | "icu" | "syntax" | "terminology" | "glossary" | "qa";
  relatedTokens?: string[];
}

export interface CatGlossaryTerm {
  id: string;
  source: string;
  target: string;
  approved: boolean;
  forbidden: boolean;
}

export interface CatTranslationMemoryMatch {
  id: string;
  sourceText: string;
  targetText: string;
  matchPercent: number;
  matchKind?: CatTmMatchKind;
  contextLabel?: string;
}

export interface CatSegmentIntelligence {
  reviewReason?: string;
  reviewRisk?: CatRiskLevel;
  intent?: string;
  locationBreadcrumb?: string;
  filePath?: string;
  componentName?: string;
  productMeaning?: string;
  segmentType?: string;
  maxLength?: number;
  agentContext?: string | null;
  reviewerPreference?: string;
  constraints?: string;
  glossaryTerms: CatGlossaryTerm[];
  translationMemoryMatches?: CatTranslationMemoryMatch[];
  aiSuggestion?: string;
  aiReasoning?: string;
  visualContext?: CatVisualContext;
}

export interface CatWorkspaceState {
  fileContext: CatFileContext;
  queueSegments: CatQueueSegment[];
  selectedSegmentId: string;
  formatChecks: CatFormatCheck[];
  segmentFormatChecks?: Record<string, CatFormatCheck[]>;
  intelligence: CatSegmentIntelligence;
  segmentIntelligence?: Record<string, CatSegmentIntelligence>;
  jobTitle?: string;
  breadcrumbs?: string[];
  primaryActionLabel?: string;
  /** @deprecated Use fileContext.canEditTranslations */
  canEditTranslations?: boolean;
  /** @deprecated Use fileContext.canAddComments */
  canAddComments?: boolean;
  /** @deprecated Use fileContext.providerKind */
  providerKind?: string | null;
  /**
   * @deprecated Legacy hydrate input only. Prefer queueSegments.
   * Full segments are split into queue meta, drafts, and intelligence on ingest.
   */
  segments?: CatSegment[];
}

export type CatWorkspaceShell = Omit<CatWorkspaceState, "queueSegments" | "segments">;
