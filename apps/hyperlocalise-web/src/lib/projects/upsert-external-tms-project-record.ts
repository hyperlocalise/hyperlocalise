import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { TmsProviderLiveProject } from "@/lib/providers/tms-provider-live";
import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

export async function upsertExternalTmsProjectRecord(input: {
  organizationId: string;
  providerCredentialId: string;
  liveProject: TmsProviderLiveProject;
  userId?: string | null;
}) {
  const projectId = encodeProviderProjectId({
    providerKind: input.liveProject.externalProviderKind,
    externalProjectId: input.liveProject.externalProjectId,
  });

  await db
    .insert(schema.projects)
    .values({
      id: projectId,
      organizationId: input.organizationId,
      teamId: null,
      createdByUserId: input.userId ?? null,
      updatedByUserId: input.userId ?? null,
      name: input.liveProject.name,
      description: input.liveProject.description ?? "",
      translationContext: input.liveProject.translationContext ?? "",
      source: "external_tms",
      externalProviderKind: input.liveProject.externalProviderKind,
      externalProviderCredentialId: input.providerCredentialId,
      externalProjectId: input.liveProject.externalProjectId,
      sourceLocale: input.liveProject.sourceLocale,
      targetLocales: input.liveProject.targetLocales,
      externalProjectUrl: input.liveProject.externalProjectUrl,
      isActive: input.liveProject.isActive,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.projects.id, schema.projects.organizationId],
      set: {
        name: input.liveProject.name,
        description: input.liveProject.description ?? "",
        translationContext: input.liveProject.translationContext ?? "",
        sourceLocale: input.liveProject.sourceLocale,
        targetLocales: input.liveProject.targetLocales,
        externalProjectUrl: input.liveProject.externalProjectUrl,
        isActive: input.liveProject.isActive,
        externalProviderCredentialId: input.providerCredentialId,
        updatedByUserId: input.userId ?? null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return projectId;
}

export async function getOrganizationExternalTmsCredentialId(
  organizationId: string,
  providerKind: (typeof schema.externalTmsProviderKindEnum.enumValues)[number],
) {
  const [credential] = await db
    .select({ id: schema.organizationExternalTmsProviderCredentials.id })
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, providerKind),
      ),
    )
    .limit(1);

  return credential?.id ?? null;
}
