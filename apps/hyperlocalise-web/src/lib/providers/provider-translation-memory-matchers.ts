import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { searchCrowdinTranslationMemoryMatches } from "@/lib/providers/crowdin/crowdin-tm-matcher";
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
    default:
      return null;
  }
}
