import { pullCrowdinTaskContent } from "@/lib/providers/crowdin/crowdin-content-puller";
import type { ExternalTmsContentPuller } from "@/lib/providers/external-tms-content-sync";
import { pullPhraseTaskContent } from "@/lib/providers/phrase/phrase-content-puller";
import { pullSmartlingTaskContent } from "@/lib/providers/smartling/smartling-content-puller";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export function getProviderContentPuller(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsContentPuller | null {
  switch (providerKind) {
    case "crowdin":
      return pullCrowdinTaskContent;
    case "phrase":
      return pullPhraseTaskContent;
    case "smartling":
      return pullSmartlingTaskContent;
    default:
      return null;
  }
}
