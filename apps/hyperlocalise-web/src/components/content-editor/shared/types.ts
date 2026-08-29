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
import type { ContentEditorVisualContext } from "@/lib/translation/content-editor-visual-context";

export type ContentEditorContentKind =
  | "text"
  | "image_file"
  | "image_url"
  | "video_file"
  | "video_url"
  | "office_file"
  | "document";

export type ContentEditorSegmentStatus = "pending" | "needs_review" | "reviewed" | "skipped";

export type ContentEditorTmMatchKind = "exact" | "context" | "fuzzy";

export type ContentEditorRiskLevel = "low" | "medium" | "high" | "good";

export type ContentEditorFormatCheckStatus = "pass" | "warn" | "fail";

export type ContentEditorFormatCheckCategory =
  | "length"
  | "placeholder"
  | "icu"
  | "syntax"
  | "terminology"
  | "glossary"
  | "qa"
  | "spelling";

export type ContentEditorSegmentCommentType = "comment" | "issue";

export type ContentEditorIssueType =
  | "general_question"
  | "translation_mistake"
  | "context_request"
  | "source_mistake"
  | "glossary_violation"
  | "qa_failure";

/** @deprecated Prefer ContentEditorIssueType — kept for Crowdin comment payloads. */
export type CrowdinIssueType = Extract<
  ContentEditorIssueType,
  "general_question" | "translation_mistake" | "context_request" | "source_mistake"
>;

export interface ContentEditorSegmentCommentInput {
  text: string;
  type?: ContentEditorSegmentCommentType;
  issueType?: ContentEditorIssueType;
}

export interface ContentEditorSegmentComment {
  id: string;
  type: ContentEditorSegmentCommentType;
  status: string | null;
  text: string;
  createdAt: string | null;
  locale: string | null;
  author?: string | null;
}

/** Queue list identity — no locale, target, or editor metadata. */
export interface ContentEditorQueueSegment {
  id: string;
  index: number;
  key: string;
  sourceText: string;
  contentKind?: ContentEditorContentKind;
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
export interface ContentEditorFileContext {
  sourcePath: string;
  filename: string;
  sourceLocale: string;
  targetLocale: string;
  providerKind: string | null;
  canEditTranslations: boolean;
  canAddComments: boolean;
  truncated?: boolean;
  teamGlossaries?: { id: string; name: string; teamId: string }[];
  contributorTeams?: { id: string; name: string; slug: string }[];
  projectTeamId?: string;
  canContributeTeamGlossary?: boolean;
  teamName?: string;
  projectTeamSlug?: string;
}

export interface ContentEditorSegment {
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
  status: ContentEditorSegmentStatus;
  hasOpenIssues?: boolean;
  /** TMS hidden string — unavailable to translators, still visible to managers. */
  isHidden?: boolean;
  /** Explicit CAT lock. Editors can set and show this independently of approved/hidden. */
  isLocked?: boolean;
  tags?: string[];
  maxLength?: number;
  comments?: ContentEditorSegmentComment[];
  contentKind?: ContentEditorContentKind;
  sourceAssetUrl?: string | null;
  targetAssetUrl?: string | null;
  imageVariantId?: string | null;
  looksLikeImageUrl?: boolean;
  looksLikeVideoUrl?: boolean;
}

export interface ContentEditorFormatCheck {
  id: string;
  label: string;
  status: ContentEditorFormatCheckStatus;
  message: string;
  category?: ContentEditorFormatCheckCategory;
  relatedTokens?: string[];
}

export interface ContentEditorGlossaryTerm {
  id: string;
  source: string;
  target: string;
  approved: boolean;
  forbidden: boolean;
}

export interface ContentEditorGlossaryConceptTerm {
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

export interface ContentEditorGlossaryConcept {
  id: string;
  glossaryId: string;
  glossaryName: string;
  glossaryUrl?: string | null;
  conceptUrl?: string | null;
  primaryTerm: string;
  subject?: string | null;
  definition?: string | null;
  translatable?: boolean;
  sourceTerms: ContentEditorGlossaryConceptTerm[];
  targetTerms: ContentEditorGlossaryConceptTerm[];
}

export interface ContentEditorTranslationMemoryMatch {
  id: string;
  sourceText: string;
  targetText: string;
  matchPercent: number;
  matchKind?: ContentEditorTmMatchKind;
  contextLabel?: string;
}

export interface ContentEditorSegmentIntelligence {
  reviewReason?: string;
  reviewRisk?: ContentEditorRiskLevel;
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
  glossaryTerms: ContentEditorGlossaryTerm[];
  glossaryConcepts?: ContentEditorGlossaryConcept[];
  translationMemoryMatches?: ContentEditorTranslationMemoryMatch[];
  aiSuggestion?: string;
  aiReasoning?: string;
  visualContext?: ContentEditorVisualContext;
}

export interface ContentEditorWorkspaceState {
  fileContext: ContentEditorFileContext;
  queueSegments: ContentEditorQueueSegment[];
  selectedSegmentId: string;
  formatChecks: ContentEditorFormatCheck[];
  segmentFormatChecks?: Record<string, ContentEditorFormatCheck[]>;
  intelligence: ContentEditorSegmentIntelligence;
  segmentIntelligence?: Record<string, ContentEditorSegmentIntelligence>;
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
  segments?: ContentEditorSegment[];
}

export type ContentEditorWorkspaceShell = Omit<
  ContentEditorWorkspaceState,
  "queueSegments" | "segments"
>;
