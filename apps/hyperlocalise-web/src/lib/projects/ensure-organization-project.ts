import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { normalizeProjectId } from "@/lib/projects/project-id";
import { getActiveOrganizationExternalTmsProviderCredentialRow } from "@/lib/providers/organization-external-tms-provider-credentials";
import { getTmsProviderLiveProject } from "@/lib/providers/tms-provider-live";
import {
  encodeProviderProjectId,
  parseProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";

/**
 * Resolves a project id for org-scoped writes that require a `projects` row.
 * Native projects must already exist. External TMS projects are materialized
 * from the active provider when needed.
 */
export async function ensureOrganizationProjectRecord(input: {
  organizationId: string;
  projectId: string;
  userId?: string | null;
}): Promise<string> {
  const projectId = normalizeProjectId(input.projectId);
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new Error("project_not_found");
  }

  const [existing] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, projectId),
      ),
    )
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const encodedProject = parseProviderProjectId(projectId);
  if (!encodedProject) {
    throw new Error("project_not_found");
  }

  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
    input.organizationId,
  );
  if (!credential || credential.providerKind !== encodedProject.providerKind) {
    throw new Error("project_not_found");
  }

  const liveProject = await getTmsProviderLiveProject(
    input.organizationId,
    encodedProject.externalProjectId,
    { actorUserId: input.userId },
  );
  if (!liveProject) {
    throw new Error("project_not_found");
  }

  const canonicalProjectId = encodeProviderProjectId(encodedProject);

  await db
    .insert(schema.projects)
    .values({
      id: canonicalProjectId,
      organizationId: input.organizationId,
      teamId: null,
      createdByUserId: input.userId ?? null,
      name: liveProject.name,
      description: "",
      translationContext: "",
      source: "external_tms",
      externalProviderKind: encodedProject.providerKind,
      externalProviderCredentialId: credential.id,
      externalProjectId: encodedProject.externalProjectId,
      sourceLocale: liveProject.sourceLocale,
      targetLocales: liveProject.targetLocales,
      externalProjectUrl: liveProject.externalProjectUrl,
      isActive: liveProject.isActive,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.projects.id,
      set: {
        name: liveProject.name,
        sourceLocale: liveProject.sourceLocale,
        targetLocales: liveProject.targetLocales,
        externalProjectUrl: liveProject.externalProjectUrl,
        isActive: liveProject.isActive,
        externalProviderCredentialId: credential.id,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return canonicalProjectId;
}
