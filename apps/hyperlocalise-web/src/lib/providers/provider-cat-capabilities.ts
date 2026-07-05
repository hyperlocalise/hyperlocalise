import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";

type ProviderCatFile = {
  provider?: {
    kind?: string;
    resourceType?: string | null;
  } | null;
};

function isExternalTmsProviderKind(kind: string): kind is ExternalTmsProviderKind {
  return kind === "crowdin" || kind === "phrase" || kind === "lokalise" || kind === "smartling";
}

/**
 * Whether a provider-backed file can open the shared CAT workspace.
 * Mirrors live CAT support in tms-provider-live (Crowdin + Phrase today).
 */
export function supportsProviderCatFile(file: ProviderCatFile): boolean {
  const provider = file.provider;
  if (!provider?.kind || !isExternalTmsProviderKind(provider.kind)) {
    return false;
  }

  if (provider.kind === "crowdin") {
    return provider.resourceType === "file";
  }

  if (provider.kind === "phrase" || provider.kind === "lokalise") {
    return provider.resourceType === "file" || provider.resourceType === "key";
  }

  return false;
}
