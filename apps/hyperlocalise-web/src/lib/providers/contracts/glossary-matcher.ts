import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";

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

export type GlossaryMatchResolution = {
  getProviderGlossaryMatcher: (
    providerKind: ExternalTmsProviderKind,
  ) => ExternalTmsGlossaryMatcher | null;
};
