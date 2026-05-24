import type { ExternalTmsCommentPusher } from "@/lib/providers/provider-feedback-types";
import { pushCrowdinProviderComments } from "@/lib/providers/crowdin/crowdin-comment-pusher";
import { pushLokaliseProviderComments } from "@/lib/providers/lokalise/lokalise-comment-pusher";
import { pushSmartlingProviderComments } from "@/lib/providers/smartling/smartling-comment-pusher";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export function getProviderCommentPusher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsCommentPusher | null {
  switch (providerKind) {
    case "smartling":
      return pushSmartlingProviderComments;
    case "crowdin":
      return pushCrowdinProviderComments;
    case "lokalise":
      return pushLokaliseProviderComments;
    default:
      return null;
  }
}
