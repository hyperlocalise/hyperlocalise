import { pushCrowdinTranslations } from "@/lib/providers/adapters/crowdin/crowdin-translation-pusher";
import type { ExternalTmsTranslationPusher } from "@/lib/providers/sync/external-tms-content-sync";
import { pushLokaliseTranslations } from "@/lib/providers/adapters/lokalise/lokalise-translation-pusher";
import { pushPhraseTranslations } from "@/lib/providers/adapters/phrase/phrase-translation-pusher";
import { pushSmartlingTranslations } from "@/lib/providers/adapters/smartling/smartling-translation-pusher";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export function getProviderTranslationPusher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsTranslationPusher | null {
  switch (providerKind) {
    case "crowdin":
      return pushCrowdinTranslations;
    case "phrase":
      return pushPhraseTranslations;
    case "smartling":
      return pushSmartlingTranslations;
    case "lokalise":
      return pushLokaliseTranslations;
    default:
      return null;
  }
}
