import { pullCrowdinTaskContent } from "@/lib/providers/crowdin/crowdin-content-puller";
import type { ExternalTmsContentPuller } from "@/lib/providers/external-tms-content-sync";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export function getProviderContentPuller(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsContentPuller | null {
  switch (providerKind) {
    case "crowdin":
      return pullCrowdinTaskContent;
    default:
      return null;
  }
}
