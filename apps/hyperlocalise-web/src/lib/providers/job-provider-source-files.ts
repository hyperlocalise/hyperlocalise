import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

function extractProviderFileIds(providerPayload: Record<string, unknown> | null | undefined) {
  if (!providerPayload) return [];

  const fileIds = providerPayload.fileIds;
  if (!Array.isArray(fileIds)) return [];

  return fileIds
    .map((fileId) => {
      if (typeof fileId === "number" || typeof fileId === "string") {
        return String(fileId);
      }
      return null;
    })
    .filter((fileId): fileId is string => Boolean(fileId));
}

export async function resolveProviderSourceFiles(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  providerPayload: Record<string, unknown> | null | undefined;
}) {
  const fileIds = extractProviderFileIds(input.providerPayload);
  if (fileIds.length === 0) return [];

  const files = await db
    .select({
      externalResourceId: schema.externalTmsFiles.externalResourceId,
      resourceType: schema.externalTmsFiles.resourceType,
      displayName: schema.externalTmsFiles.displayName,
      sourcePath: schema.externalTmsFiles.sourcePath,
      externalUrl: schema.externalTmsFiles.externalUrl,
    })
    .from(schema.externalTmsFiles)
    .where(
      and(
        eq(schema.externalTmsFiles.organizationId, input.organizationId),
        eq(schema.externalTmsFiles.projectId, input.projectId),
        eq(schema.externalTmsFiles.providerKind, input.providerKind),
        inArray(schema.externalTmsFiles.externalResourceId, fileIds),
      ),
    );

  const filesById = new Map(files.map((file) => [file.externalResourceId, file]));

  return fileIds.map((fileId) => {
    const file = filesById.get(fileId);
    if (file) {
      return {
        id: fileId,
        displayName: file.displayName,
        sourcePath: file.sourcePath,
        resourceType: file.resourceType,
        externalUrl: file.externalUrl,
      };
    }

    return {
      id: fileId,
      displayName: fileId,
      sourcePath: null,
      resourceType: null,
      externalUrl: null,
    };
  });
}
