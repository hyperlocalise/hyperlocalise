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
import type { CatVisualContext } from "@/lib/translation/cat-visual-context";

export type CatContentKind =
  | "text"
  | "image_file"
  | "image_url"
  | "video_file"
  | "video_url"
  | "office_file";

export type CatSegmentStatus = "pending" | "needs_review" | "reviewed" | "skipped";

export type CatTmMatchKind = "exact" | "context" | "fuzzy";

export type CatRiskLevel = "low" | "medium" | "high" | "good";

export type CatFormatCheckStatus = "pass" | "warn" | "fail";

export type CatSegmentCommentType = "comment" | "issue";

export type CatIssueType =
  | "general_question"
  | "translation_mistake"
  | "context_request"
  | "source_mistake"
  | "glossary_violation"
  | "qa_failure";

/** @deprecated Prefer CatIssueType — kept for Crowdin comment payloads. */
export type CrowdinIssueType = Extract<
  CatIssueType,
  "general_question" | "translation_mistake" | "context_request" | "source_mistake"
>;

export interface CatSegmentCommentInput {
  text: string;
  type?: CatSegmentCommentType;
  issueType?: CatIssueType;
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
  contentKind?: CatContentKind;
  sourceAssetUrl?: string | null;
  targetAssetUrl?: string | null;
  imageVariantId?: string | null;
  looksLikeImageUrl?: boolean;
  looksLikeVideoUrl?: boolean;
  /** TMS hidden string — unavailable to translators, still visible to managers. */
  isHidden?: boolean;
  /** Explicit CAT lock. Editors can set and show this independently of approved/hidden. */
  isLocked?: boolean;
  /** Set when the queue spans multiple files. */
  sourcePath?: string;
  externalResourceId?: string;
  resourceType?: "file" | "key";
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
  /** Present when the queue spans multiple files. */
  sourcePath?: string;
  sourceLocale: string;
  targetLocale: string;
  contextLabel?: string;
  status: CatSegmentStatus;
  hasOpenIssues?: boolean;
  /** TMS hidden string — unavailable to translators, still visible to managers. */
  isHidden?: boolean;
  /** Explicit CAT lock. Editors can set and show this independently of approved/hidden. */
  isLocked?: boolean;
  tags?: string[];
  maxLength?: number;
  comments?: CatSegmentComment[];
  contentKind?: CatContentKind;
  sourceAssetUrl?: string | null;
  targetAssetUrl?: string | null;
  imageVariantId?: string | null;
  looksLikeImageUrl?: boolean;
  looksLikeVideoUrl?: boolean;
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

export interface CatGlossaryConceptTerm {
  id: string;
  locale: string;
  text: string;
  status?: string | null;
  forbidden?: boolean;
  preferred?: boolean;
  termType?: string | null;
  partOfSpeech?: string | null;
  gender?: string | null;
}

export interface CatGlossaryConcept {
  id: string;
  glossaryId: string;
  glossaryName: string;
  glossaryUrl?: string | null;
  conceptUrl?: string | null;
  primaryTerm: string;
  subject?: string | null;
  definition?: string | null;
  sourceTerms: CatGlossaryConceptTerm[];
  targetTerms: CatGlossaryConceptTerm[];
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
  glossaryConcepts?: CatGlossaryConcept[];
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
