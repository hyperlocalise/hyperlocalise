import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { searchCrowdinGlossaryMatches } from "@/lib/providers/crowdin/crowdin-glossary-matcher";
import { searchLokaliseGlossaryMatches } from "@/lib/providers/lokalise/lokalise-glossary-matcher";
import type { NormalizedGlossaryMatch } from "@/lib/translation/glossary-match";

type ExternalTmsCredential =
  typeof import("@/lib/database/schema").organizationExternalTmsProviderCredentials.$inferSelect;

export type ExternalTmsGlossaryMatcherInput = {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  secretMaterial: string;
  glossaries: Array<{
    id: string;
    name: string;
    externalGlossaryId: string | null;
    targetLocale: string | null;
    termCapabilities: Record<string, unknown>;
  }>;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  limit: number;
};

export type ExternalTmsGlossaryMatcher = (
  input: ExternalTmsGlossaryMatcherInput,
) => Promise<NormalizedGlossaryMatch[]>;

export function getProviderGlossaryMatcher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsGlossaryMatcher | null {
  switch (providerKind) {
    case "crowdin":
      return searchCrowdinGlossaryMatches;
    case "lokalise":
      return searchLokaliseGlossaryMatches;
    default:
      return null;
  }
}
