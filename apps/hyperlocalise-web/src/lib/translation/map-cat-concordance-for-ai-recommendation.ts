import type { CatGlossaryTerm, CatTranslationMemoryMatch } from "@/components/cat/types";

import type { CatAiRecommendationInput } from "./generate-cat-ai-recommendation";

export type CatConcordanceForAiRecommendation = {
  glossaryTerms: CatGlossaryTerm[];
  translationMemoryMatches: CatTranslationMemoryMatch[];
};

export function mapCatConcordanceForAiRecommendation(
  concordance: CatConcordanceForAiRecommendation,
  targetLocale: string,
): Pick<CatAiRecommendationInput, "glossaryTerms" | "translationMemoryMatches"> {
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
