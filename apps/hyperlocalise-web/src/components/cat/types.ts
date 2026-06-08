export type CatSegmentStatus = "pending" | "needs_review" | "reviewed" | "skipped";

export type CatSuggestionSource = "ai" | "glossary" | "tm" | "mt";

export type CatRiskLevel = "low" | "medium" | "high" | "good";

export type CatFormatCheckStatus = "pass" | "warn" | "fail";

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
  tags?: string[];
  maxLength?: number;
}

export interface CatSuggestion {
  id: string;
  source: CatSuggestionSource;
  text: string;
  matchPercent?: number;
  metadata?: string;
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
}

export interface CatTranslationMemoryMatch {
  id: string;
  sourceText: string;
  targetText: string;
  matchPercent: number;
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
  reviewerPreference?: string;
  constraints?: string;
  glossaryTerms: CatGlossaryTerm[];
  translationMemoryMatches?: CatTranslationMemoryMatch[];
  aiSuggestion?: string;
  aiReasoning?: string;
}

export interface CatQueueSummary {
  total: number;
  reviewed: number;
}

export interface CatWorkspaceState {
  segments: CatSegment[];
  selectedSegmentId: string;
  queueSummary: CatQueueSummary;
  formatChecks: CatFormatCheck[];
  suggestions: CatSuggestion[];
  intelligence: CatSegmentIntelligence;
  jobTitle?: string;
  breadcrumbs?: string[];
}
