import { pullCrowdinTaskContent } from "@/lib/providers/adapters/crowdin/crowdin-content-puller";
import type { ExternalTmsContentPuller } from "@/lib/providers/sync/external-tms-content-sync";
import { pullLokaliseTaskContent } from "@/lib/providers/adapters/lokalise/lokalise-content-puller";
import { pullPhraseTaskContent } from "@/lib/providers/adapters/phrase/phrase-content-puller";
import { pullSmartlingTaskContent } from "@/lib/providers/adapters/smartling/smartling-content-puller";

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
    case "lokalise":
      return pullLokaliseTaskContent;
    default:
      return null;
  }
}
