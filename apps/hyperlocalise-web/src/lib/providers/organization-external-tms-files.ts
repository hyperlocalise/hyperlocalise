import { and, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { normalizeSourcePath } from "@/lib/file-storage/records";

import { snapshotExternalTmsFileVersion } from "./organization-external-tms-file-versions";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

const defaultExternalTmsFilesLimit = 500;
export const maxExternalTmsFilesLimit = 1_000;

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

export type ExternalTmsFileListFilters = {
  providerKind?: ExternalTmsProviderKind | "all";
  locale?: string;
  syncState?: string;
  search?: string;
};

function defaultDisplayName(sourcePath: string) {
  return sourcePath.split("/").filter(Boolean).at(-1) ?? sourcePath;
}

function normalizeLimit(limit?: number) {
  return Math.min(Math.max(limit ?? defaultExternalTmsFilesLimit, 1), maxExternalTmsFilesLimit);
}

function providerRevisionChanged(
  existing: { revision: string | null; sourceHash: string | null },
  incoming: { revision?: string | null; sourceHash?: string | null },
) {
  const nextRevision = incoming.revision ?? null;
  const nextSourceHash = incoming.sourceHash ?? null;

  if (existing.revision !== nextRevision) {
    return true;
  }

  if (existing.sourceHash !== nextSourceHash) {
    return true;
  }

  return false;
}

export async function upsertExternalTmsFile(input: ExternalTmsFileInput) {
  const now = new Date();
  const sourcePath = normalizeSourcePath(input.sourcePath);

  const [existing] = await db
    .select()
    .from(schema.externalTmsFiles)
    .where(
      and(
        eq(schema.externalTmsFiles.organizationId, input.organizationId),
        eq(schema.externalTmsFiles.providerKind, input.providerKind),
        eq(schema.externalTmsFiles.externalProjectId, input.externalProjectId),
        eq(schema.externalTmsFiles.resourceType, input.resourceType),
        eq(schema.externalTmsFiles.externalResourceId, input.externalResourceId),
      ),
    )
    .limit(1);

  if (
    existing &&
    providerRevisionChanged(existing, input) &&
    (existing.revision || existing.sourceHash || existing.storedFileId)
  ) {
    await snapshotExternalTmsFileVersion({
      organizationId: existing.organizationId,
      projectId: existing.projectId,
      externalTmsFileId: existing.id,
      sourcePath: existing.sourcePath,
      revision: existing.revision,
      sourceHash: existing.sourceHash,
      storedFileId: existing.storedFileId,
      format: existing.format,
      capturedAt: existing.lastSyncedAt ?? existing.updatedAt,
    });
  }

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
      syncState: input.syncState ?? "pending",
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
        syncState: input.syncState ?? "pending",
        localeReadiness: input.localeReadiness ?? {},
        providerPayload: input.providerPayload ?? {},
        ...(input.lastSyncedAt !== undefined && { lastSyncedAt: input.lastSyncedAt }),
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
  filters?: ExternalTmsFileListFilters;
  limit?: number;
}) {
  const filters: SQL[] = [
    eq(schema.externalTmsFiles.organizationId, input.organizationId),
    eq(schema.externalTmsFiles.projectId, input.projectId),
  ];

  if (input.resourceTypes && input.resourceTypes.length > 0) {
    filters.push(inArray(schema.externalTmsFiles.resourceType, input.resourceTypes));
  }

  if (input.filters?.providerKind && input.filters.providerKind !== "all") {
    filters.push(eq(schema.externalTmsFiles.providerKind, input.filters.providerKind));
  }

  const syncState = input.filters?.syncState?.trim();
  if (syncState && syncState !== "all") {
    filters.push(eq(schema.externalTmsFiles.syncState, syncState));
  }

  const locale = input.filters?.locale?.trim();
  if (locale && locale !== "all") {
    const localeFilter = or(
      eq(schema.externalTmsFiles.sourceLocale, locale),
      sql`${schema.externalTmsFiles.targetLocales} @> ${JSON.stringify([locale])}::jsonb`,
    );
    if (localeFilter) {
      filters.push(localeFilter);
    }
  }

  const search = input.filters?.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    const searchFilter = or(
      ilike(schema.externalTmsFiles.sourcePath, pattern),
      ilike(schema.externalTmsFiles.displayName, pattern),
      ilike(schema.externalTmsFiles.externalResourceId, pattern),
      sql`${schema.externalTmsFiles.providerKind}::text ILIKE ${pattern}`,
      sql`${schema.externalTmsFiles.resourceType}::text ILIKE ${pattern}`,
    );
    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  return db
    .select()
    .from(schema.externalTmsFiles)
    .where(and(...filters))
    .orderBy(schema.externalTmsFiles.sourcePath, schema.externalTmsFiles.displayName)
    .limit(normalizeLimit(input.limit));
}
