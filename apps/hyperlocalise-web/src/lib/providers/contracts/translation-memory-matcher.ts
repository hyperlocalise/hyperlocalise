import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { NormalizedTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";

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

export type TranslationMemoryMatchResolution = {
  getProviderTranslationMemoryMatcher: (
    providerKind: ExternalTmsProviderKind,
  ) => ExternalTmsTranslationMemoryMatcher | null;
  memorySupportsLiveSearch: (memory: {
    capabilityMode: string | null;
    externalProviderKind: string | null;
  }) => boolean;
};
