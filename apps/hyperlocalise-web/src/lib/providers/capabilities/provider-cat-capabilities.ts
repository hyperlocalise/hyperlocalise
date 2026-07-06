import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import { getTmsProvider } from "@/lib/providers/adapters/tms-provider-registry";

type ProviderCatFile = {
  provider?: {
    kind?: string;
    resourceType?: string | null;
  } | null;
};

function isExternalTmsProviderKind(kind: string): kind is ExternalTmsProviderKind {
  return kind === "crowdin" || kind === "phrase" || kind === "lokalise" || kind === "smartling";
}

export function supportsProviderCatFile(file: ProviderCatFile): boolean {
  const provider = file.provider;
  if (!provider?.kind || !isExternalTmsProviderKind(provider.kind)) {
    return false;
  }

  const resourceSupport = getTmsProvider(provider.kind).resourceSupport.providerCat;

  if (provider.resourceType === "file") {
    return resourceSupport.file;
  }

  if (provider.resourceType === "key") {
    return resourceSupport.key;
  }

  return false;
}
