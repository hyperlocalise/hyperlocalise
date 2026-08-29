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
import type {
  ContentEditorGlossaryTerm,
  ContentEditorTranslationMemoryMatch,
} from "@/components/content-editor/shared/types";

export type ContentEditorConcordanceForAiRecommendation = {
  glossaryTerms: ContentEditorGlossaryTerm[];
  translationMemoryMatches: ContentEditorTranslationMemoryMatch[];
};

export type ContentEditorRecommendationConcordanceContext = {
  glossaryTerms: Array<{
    sourceTerm: string;
    targetTerm: string;
    targetLocale: string;
    forbidden?: boolean | null;
    description?: string | null;
  }>;
  translationMemoryMatches: Array<{
    sourceText: string;
    targetText: string;
    targetLocale: string;
  }>;
};

export function mapCatConcordanceForAiRecommendation(
  concordance: ContentEditorConcordanceForAiRecommendation,
  targetLocale: string,
): ContentEditorRecommendationConcordanceContext {
  return {
    glossaryTerms: concordance.glossaryTerms
      .filter((term) => term.target.trim().length > 0)
      .map((term) => ({
        sourceTerm: term.source,
        targetTerm: term.target,
        targetLocale,
        forbidden: term.forbidden,
        description: null,
      })),
    translationMemoryMatches: concordance.translationMemoryMatches.map((match) => ({
      sourceText: match.sourceText,
      targetText: match.targetText,
      targetLocale,
    })),
  };
}
