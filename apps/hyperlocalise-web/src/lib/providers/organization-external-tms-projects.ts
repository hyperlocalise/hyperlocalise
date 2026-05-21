import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, schema } from "@/lib/database";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export async function upsertOrganizationExternalTmsProject(input: {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  name: string;
  sourceLocale?: string | null;
  targetLocales: string[];
  externalProjectUrl?: string | null;
  isActive?: boolean;
  syncErrorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId: input.organizationId,
      name: input.name,
      description: "",
      translationContext: "",
      source: "external_tms",
      externalProviderCredentialId: input.providerCredentialId,
      externalProviderKind: input.providerKind,
      externalProjectId: input.externalProjectId,
      sourceLocale: input.sourceLocale ?? null,
      targetLocales: input.targetLocales,
      externalProjectUrl: input.externalProjectUrl ?? null,
      isActive: input.isActive ?? true,
      lastSyncedAt: now,
      lastSyncErrorAt: input.syncErrorMessage ? now : null,
      lastSyncErrorMessage: input.syncErrorMessage ?? null,
      providerMetadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [
        schema.projects.organizationId,
        schema.projects.externalProviderKind,
        schema.projects.externalProjectId,
      ],
      set: {
        name: input.name,
        source: "external_tms",
        externalProviderCredentialId: input.providerCredentialId,
        sourceLocale: input.sourceLocale ?? null,
        targetLocales: input.targetLocales,
        externalProjectUrl: input.externalProjectUrl ?? null,
        isActive: input.isActive ?? true,
        lastSyncedAt: now,
        lastSyncErrorAt: input.syncErrorMessage ? now : null,
        lastSyncErrorMessage: input.syncErrorMessage ?? null,
        providerMetadata: input.metadata ?? {},
        updatedAt: now,
      },
    })
    .returning();

  return project;
}

export async function listOrganizationExternalTmsProjects(input: {
  organizationId: string;
  providerKind?: ExternalTmsProviderKind;
}) {
  return db
    .select()
    .from(schema.projects)
    .where(
      input.providerKind
        ? and(
            eq(schema.projects.organizationId, input.organizationId),
            eq(schema.projects.externalProviderKind, input.providerKind),
            eq(schema.projects.source, "external_tms"),
          )
        : and(
            eq(schema.projects.organizationId, input.organizationId),
            eq(schema.projects.source, "external_tms"),
          ),
    );
}
