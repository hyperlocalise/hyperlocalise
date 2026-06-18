import type { ExternalTmsTaskContent } from "@/lib/providers/tms-provider-types";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";

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

export { getProviderReviewPuller } from "@/lib/providers/adapters/tms-provider-adapter-registry";
