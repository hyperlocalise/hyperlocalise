import { pushCrowdinTranslations } from "@/lib/providers/crowdin/crowdin-translation-pusher";
import type { ExternalTmsTranslationPusher } from "@/lib/providers/external-tms-content-sync";
import { pushPhraseTranslations } from "@/lib/providers/phrase/phrase-translation-pusher";
import { pushSmartlingTranslations } from "@/lib/providers/smartling/smartling-translation-pusher";

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
    default:
      return null;
  }
}
