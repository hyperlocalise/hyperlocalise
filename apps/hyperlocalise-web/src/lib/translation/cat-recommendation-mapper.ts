import type { CatGlossaryTerm, CatTranslationMemoryMatch } from "@/components/cat/shared/types";

export type CatConcordanceForAiRecommendation = {
  glossaryTerms: CatGlossaryTerm[];
  translationMemoryMatches: CatTranslationMemoryMatch[];
};

export type CatRecommendationConcordanceContext = {
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
  concordance: CatConcordanceForAiRecommendation,
  targetLocale: string,
): CatRecommendationConcordanceContext {
  return {
    glossaryTerms: concordance.glossaryTerms.map((term) => ({
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
