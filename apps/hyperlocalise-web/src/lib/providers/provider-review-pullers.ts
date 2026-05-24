import { pullCrowdinProviderReview } from "@/lib/providers/crowdin/crowdin-review-puller";
import type { ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";
import { pullLokaliseProviderReview } from "@/lib/providers/lokalise/lokalise-review-puller";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";
import { pullPhraseProviderReview } from "@/lib/providers/phrase/phrase-review-puller";

import { schema } from "@/lib/database";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

type ExternalTmsProject = typeof schema.projects.$inferSelect;

export type ExternalTmsReviewPuller = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalJobId: string;
  credential: { baseUrl?: string | null; region?: string | null };
  secretMaterial: string;
  project: ExternalTmsProject;
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
    case "phrase":
      return async (input) =>
        pullPhraseProviderReview({
          credential: input.credential,
          secretMaterial: input.secretMaterial,
          externalProjectId: input.externalProjectId,
          externalJobId: input.externalJobId,
          project: input.project,
          content: input.content,
        });
    case "lokalise":
      return async (input) =>
        pullLokaliseProviderReview({
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
