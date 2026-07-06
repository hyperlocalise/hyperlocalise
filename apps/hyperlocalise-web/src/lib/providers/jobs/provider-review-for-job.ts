import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { mergeProviderReviewReports } from "@/lib/providers/provider-job-review/normalize-provider-review";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";
import { getProviderReviewPuller } from "@/lib/providers/adapters/tms-provider-registry";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/shared/tms-provider-content";
import type { ExternalTmsTaskContent } from "@/lib/providers/jobs/tms-provider-types";

export async function pullProviderReviewForJob(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
  content: ExternalTmsTaskContent;
  previousReport?: ProviderReviewReport | null;
  actorUserId?: string | null;
}): Promise<ProviderReviewReport | null> {
  const pullReview = getProviderReviewPuller(input.providerKind);
  if (!pullReview) {
    return null;
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.externalProviderKind, input.providerKind),
        eq(schema.projects.source, "external_tms"),
      ),
    )
    .limit(1);

  if (!project?.externalProjectId) {
    throw new Error("external_tms_project_not_found");
  }
  if (!project.externalProviderCredentialId) {
    throw new Error("provider_credential_not_found");
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(
          schema.organizationExternalTmsProviderCredentials.id,
          project.externalProviderCredentialId,
        ),
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
      ),
    )
    .limit(1);

  if (!credential) {
    throw new Error("provider_credential_not_found");
  }

  const secretMaterial = await resolveExternalTmsSecretMaterialForActor({
    credential,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const incoming = await pullReview({
    organizationId: input.organizationId,
    projectId: input.projectId,
    providerKind: input.providerKind,
    externalProjectId: project.externalProjectId,
    externalJobId: input.externalJobId,
    credential,
    secretMaterial,
    project,
    content: input.content,
  });

  return mergeProviderReviewReports(input.previousReport, incoming);
}
