import { pullCrowdinProviderReview } from "@/lib/providers/crowdin/crowdin-review-puller";
import type { ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export type ExternalTmsReviewPuller = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalJobId: string;
  credential: { baseUrl?: string | null };
  secretMaterial: string;
  content: ExternalTmsTaskContent;
}) => Promise<ProviderReviewReport>;

export function getProviderReviewPuller(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsReviewPuller | null {
  switch (providerKind) {
    case "crowdin":
      return async (input) =>
        pullCrowdinProviderReview({
          credential: input.credential,
          secretMaterial: input.secretMaterial,
          externalProjectId: input.externalProjectId,
          externalJobId: input.externalJobId,
          content: input.content,
        });
    default:
      return null;
  }
}
