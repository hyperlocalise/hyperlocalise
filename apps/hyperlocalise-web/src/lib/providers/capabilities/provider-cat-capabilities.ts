/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
