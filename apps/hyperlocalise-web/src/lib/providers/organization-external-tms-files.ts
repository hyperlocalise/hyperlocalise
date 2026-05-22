import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { normalizeSourcePath } from "@/lib/file-storage/records";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export type ExternalTmsResourceType =
  (typeof schema.externalTmsResourceTypeEnum.enumValues)[number];

export type ExternalTmsFileInput = {
  organizationId: string;
  projectId: string;
  providerCredentialId?: string | null;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  resourceType: ExternalTmsResourceType;
  externalResourceId: string;
  sourcePath: string;
  displayName?: string | null;
  format?: string | null;
  sourceLocale?: string | null;
  targetLocales?: string[];
  sourceHash?: string | null;
  revision?: string | null;
  storedFileId?: string | null;
  externalUrl?: string | null;
  syncState?: string;
  localeReadiness?: Record<string, unknown>;
  providerPayload?: Record<string, unknown>;
  lastSyncedAt?: Date | null;
};

function defaultDisplayName(sourcePath: string) {
  return sourcePath.split("/").filter(Boolean).at(-1) ?? sourcePath;
}

export async function upsertExternalTmsFile(input: ExternalTmsFileInput) {
  const now = new Date();
  const sourcePath = normalizeSourcePath(input.sourcePath);
  const [file] = await db
    .insert(schema.externalTmsFiles)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      providerCredentialId: input.providerCredentialId ?? null,
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
      resourceType: input.resourceType,
      externalResourceId: input.externalResourceId,
      sourcePath,
      displayName: input.displayName?.trim() || defaultDisplayName(sourcePath),
      format: input.format ?? null,
      sourceLocale: input.sourceLocale ?? null,
      targetLocales: input.targetLocales ?? [],
      sourceHash: input.sourceHash ?? null,
      revision: input.revision ?? null,
      storedFileId: input.storedFileId ?? null,
      externalUrl: input.externalUrl ?? null,
      syncState: input.syncState ?? "synced",
      localeReadiness: input.localeReadiness ?? {},
      providerPayload: input.providerPayload ?? {},
      lastSyncedAt: input.lastSyncedAt ?? now,
    })
    .onConflictDoUpdate({
      target: [
        schema.externalTmsFiles.organizationId,
        schema.externalTmsFiles.providerKind,
        schema.externalTmsFiles.externalProjectId,
        schema.externalTmsFiles.resourceType,
        schema.externalTmsFiles.externalResourceId,
      ],
      set: {
        projectId: input.projectId,
        providerCredentialId: input.providerCredentialId ?? null,
        sourcePath,
        displayName: input.displayName?.trim() || defaultDisplayName(sourcePath),
        format: input.format ?? null,
        sourceLocale: input.sourceLocale ?? null,
        targetLocales: input.targetLocales ?? [],
        sourceHash: input.sourceHash ?? null,
        revision: input.revision ?? null,
        storedFileId: input.storedFileId ?? null,
        externalUrl: input.externalUrl ?? null,
        syncState: input.syncState ?? "synced",
        localeReadiness: input.localeReadiness ?? {},
        providerPayload: input.providerPayload ?? {},
        lastSyncedAt: input.lastSyncedAt ?? now,
        updatedAt: now,
      },
    })
    .returning();

  if (!file) {
    throw new Error("Failed to upsert external TMS file");
  }

  return file;
}

export async function listExternalTmsFilesForProject(input: {
  organizationId: string;
  projectId: string;
  resourceTypes?: ExternalTmsResourceType[];
}) {
  const filters = [
    eq(schema.externalTmsFiles.organizationId, input.organizationId),
    eq(schema.externalTmsFiles.projectId, input.projectId),
  ];

  if (input.resourceTypes && input.resourceTypes.length > 0) {
    filters.push(inArray(schema.externalTmsFiles.resourceType, input.resourceTypes));
  }

  return db
    .select()
    .from(schema.externalTmsFiles)
    .where(and(...filters))
    .orderBy(schema.externalTmsFiles.sourcePath, schema.externalTmsFiles.displayName);
}
