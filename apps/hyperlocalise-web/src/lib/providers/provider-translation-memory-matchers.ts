import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { searchCrowdinTranslationMemoryMatches } from "@/lib/providers/crowdin/crowdin-tm-matcher";
import { searchLokaliseTranslationMemoryMatches } from "@/lib/providers/lokalise/lokalise-tm-matcher";
import { searchPhraseTranslationMemoryMatches } from "@/lib/providers/phrase/phrase-tm-matcher";
import { searchSmartlingTranslationMemoryMatches } from "@/lib/providers/smartling/smartling-tm-matcher";
import type { NormalizedTranslationMemoryMatch } from "@/lib/translation/translation-memory-match";

type ExternalTmsCredential =
  typeof import("@/lib/database/schema").organizationExternalTmsProviderCredentials.$inferSelect;

export type ExternalTmsTranslationMemoryMatcherInput = {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  secretMaterial: string;
  memory: {
    id: string;
    name: string;
    externalMemoryId: string | null;
    capabilityMode: string | null;
  };
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  limit: number;
  externalJobUid?: string | null;
  project?: {
    providerMetadata: Record<string, unknown>;
    externalProjectId: string | null;
  };
};

export type ExternalTmsTranslationMemoryMatcher = (
  input: ExternalTmsTranslationMemoryMatcherInput,
) => Promise<NormalizedTranslationMemoryMatch[]>;

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
