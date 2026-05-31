import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type {
  ExternalTmsGlossaryMatcher,
  ExternalTmsGlossaryMatcherInput,
} from "@/lib/providers/contracts/glossary-matcher";
import { searchCrowdinGlossaryMatches } from "@/lib/providers/adapters/crowdin/crowdin-glossary-matcher";
import { searchLokaliseGlossaryMatches } from "@/lib/providers/adapters/lokalise/lokalise-glossary-matcher";
import { searchSmartlingGlossaryMatches } from "@/lib/providers/adapters/smartling/smartling-glossary-matcher";

export type { ExternalTmsGlossaryMatcher, ExternalTmsGlossaryMatcherInput };

export function getProviderGlossaryMatcher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsGlossaryMatcher | null {
  switch (providerKind) {
    case "crowdin":
      return searchCrowdinGlossaryMatches;
    case "lokalise":
      return searchLokaliseGlossaryMatches;
    case "smartling":
      return searchSmartlingGlossaryMatches;
    default:
      return null;
  }
}
