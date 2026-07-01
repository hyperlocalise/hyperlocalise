import type { ProviderReviewContext } from "@/lib/providers/provider-job-review/types";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";
import type {
  ExternalTmsCredential,
  ExternalTmsProviderKind,
} from "@/lib/providers/organization-external-tms-provider-credentials";

export type ProviderQaFeedbackUpload = {
  findingId: string;
  finding: ProviderQaFinding;
  providerReviewContext?: ProviderReviewContext | null;
};

export type ProviderCommentChangedItem = {
  type: "provider_comment";
  findingId: string;
  status: "posted" | "skipped" | "failed";
  externalIssueUid?: string | null;
  externalCommentUid?: string | null;
  hashcode?: string | null;
  locale?: string | null;
  message?: string | null;
  providerReviewContext?: ProviderReviewContext | null;
};

export type ProviderTranslationWritebackChangedItem = {
  type: "provider_translation_writeback";
  itemId: string;
  externalStringId: string;
  key: string;
  locale: string;
  status: "uploaded" | "skipped" | "failed";
  sourceAgentRunId?: string | null;
  message?: string | null;
};

export type ExternalTmsCommentPusher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalJobId: string;
  credential: Pick<ExternalTmsCredential, "baseUrl">;
  secretMaterial: string;
  feedback: ProviderQaFeedbackUpload[];
  knownExternalIds: Map<string, { issueUid: string; commentUid?: string | null }>;
}) => Promise<{
  posted: number;
  skipped: number;
  failed: number;
  changedItems: ProviderCommentChangedItem[];
  failures: Array<{ findingId: string; message: string }>;
}>;
