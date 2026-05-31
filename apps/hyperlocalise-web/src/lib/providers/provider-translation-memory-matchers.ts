import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type {
  ExternalTmsTranslationMemoryMatcher,
  ExternalTmsTranslationMemoryMatcherInput,
} from "@/lib/providers/contracts/translation-memory-matcher";
import { searchCrowdinTranslationMemoryMatches } from "@/lib/providers/adapters/crowdin/crowdin-tm-matcher";
import { searchLokaliseTranslationMemoryMatches } from "@/lib/providers/adapters/lokalise/lokalise-tm-matcher";
import { searchPhraseTranslationMemoryMatches } from "@/lib/providers/adapters/phrase/phrase-tm-matcher";
import { searchSmartlingTranslationMemoryMatches } from "@/lib/providers/adapters/smartling/smartling-tm-matcher";

export type { ExternalTmsTranslationMemoryMatcher, ExternalTmsTranslationMemoryMatcherInput };

export function getProviderTranslationMemoryMatcher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsTranslationMemoryMatcher | null {
  switch (providerKind) {
    case "crowdin":
      return searchCrowdinTranslationMemoryMatches;
    case "phrase":
      return searchPhraseTranslationMemoryMatches;
    case "lokalise":
      return searchLokaliseTranslationMemoryMatches;
    case "smartling":
      return searchSmartlingTranslationMemoryMatches;
    default:
      return null;
  }
}
