import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";

type ProviderCatFile = {
  provider?: {
    kind?: string;
    resourceType?: string | null;
  } | null;
};

type ProviderCatResourceSupport = {
  file: boolean;
  key: boolean;
};

// Keep in sync with TmsProvider.resourceSupport.providerCat in each *-provider.ts file.
const providerCatResourceSupportByKind: Record<
  ExternalTmsProviderKind,
  ProviderCatResourceSupport
> = {
  crowdin: { file: true, key: false },
  phrase: { file: true, key: true },
  lokalise: { file: true, key: true },
  smartling: { file: false, key: false },
};

function isExternalTmsProviderKind(kind: string): kind is ExternalTmsProviderKind {
  return kind === "crowdin" || kind === "phrase" || kind === "lokalise" || kind === "smartling";
}

export function supportsProviderCatFile(file: ProviderCatFile): boolean {
  const provider = file.provider;
  if (!provider?.kind || !isExternalTmsProviderKind(provider.kind)) {
    return false;
  }

  const resourceSupport = providerCatResourceSupportByKind[provider.kind];

  if (provider.resourceType === "file") {
    return resourceSupport.file;
  }

  if (provider.resourceType === "key") {
    return resourceSupport.key;
  }

  return false;
}
