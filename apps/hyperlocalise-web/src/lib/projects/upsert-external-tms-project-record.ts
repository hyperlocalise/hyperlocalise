import { and, eq, notInArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import type { TmsProviderLiveProject } from "@/lib/providers/tms-provider-live";
import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

import { removeAllExternalTmsJobsForProject } from "./upsert-external-tms-job-records";

async function removeExternalTmsJobsForProjects(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  projectIds: string[];
}) {
  let removedJobs = 0;

  for (const projectId of input.projectIds) {
    removedJobs += await removeAllExternalTmsJobsForProject({
      organizationId: input.organizationId,
      projectId,
      providerKind: input.providerKind,
    });
  }

  return removedJobs;
}

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

export async function deactivateMissingExternalTmsProjects(input: {
  organizationId: string;
  providerCredentialId: string;
  providerKind: (typeof schema.externalTmsProviderKindEnum.enumValues)[number];
  syncedProjectIds: string[];
}) {
  if (input.syncedProjectIds.length === 0) {
    return 0;
  }

  const now = new Date();
  const deactivated = await db
    .update(schema.projects)
    .set({
      isActive: false,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.source, "external_tms"),
        eq(schema.projects.externalProviderKind, input.providerKind),
        eq(schema.projects.externalProviderCredentialId, input.providerCredentialId),
        eq(schema.projects.isActive, true),
        notInArray(schema.projects.id, input.syncedProjectIds),
      ),
    )
    .returning({ id: schema.projects.id });

  await removeExternalTmsJobsForProjects({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    projectIds: deactivated.map((project) => project.id),
  });

  return deactivated.length;
}

export async function deactivateExternalTmsProject(input: {
  organizationId: string;
  projectId: string;
}) {
  const now = new Date();
  const deactivated = await db
    .update(schema.projects)
    .set({
      isActive: false,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.source, "external_tms"),
        eq(schema.projects.isActive, true),
      ),
    )
    .returning({
      id: schema.projects.id,
      externalProviderKind: schema.projects.externalProviderKind,
    });

  if (deactivated.length === 0) {
    return false;
  }

  const [project] = deactivated;
  if (project.externalProviderKind) {
    await removeExternalTmsJobsForProjects({
      organizationId: input.organizationId,
      providerKind: project.externalProviderKind,
      projectIds: [project.id],
    });
  }

  return true;
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
