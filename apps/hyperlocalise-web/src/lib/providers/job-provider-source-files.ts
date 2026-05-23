import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

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

function providerFileIdMatchExpressions(externalResourceId: string) {
  const numericId = Number(externalResourceId);
  const candidates = [externalResourceId];
  if (!Number.isNaN(numericId)) {
    candidates.push(String(numericId));
  }

  return candidates.flatMap((fileId) => [
    sql`${schema.externalJobDetails.providerPayload}->'fileIds' @> ${JSON.stringify([fileId])}::jsonb`,
    sql`${schema.externalJobDetails.providerPayload}->'fileIds' @> ${JSON.stringify([Number(fileId)])}::jsonb`,
  ]);
}

export async function resolveProviderJobsForFile(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalResourceId: string;
}) {
  const fileIdMatches = providerFileIdMatchExpressions(input.externalResourceId);
  if (fileIdMatches.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: schema.jobs.id,
      status: schema.jobs.status,
      createdAt: schema.jobs.createdAt,
      updatedAt: schema.jobs.updatedAt,
      externalJobId: schema.externalJobDetails.externalJobId,
      externalTaskId: schema.externalJobDetails.externalTaskId,
      providerKind: schema.externalJobDetails.providerKind,
      externalStatus: schema.externalJobDetails.externalStatus,
      title: schema.externalJobDetails.title,
      syncState: schema.externalJobDetails.syncState,
      targetLocales: schema.externalJobDetails.targetLocales,
      externalUrl: schema.externalJobDetails.externalUrl,
      linkedJobId: schema.externalJobDetails.linkedJobId,
    })
    .from(schema.externalJobDetails)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.externalJobDetails.jobId))
    .where(
      and(
        eq(schema.externalJobDetails.organizationId, input.organizationId),
        eq(schema.jobs.projectId, input.projectId),
        eq(schema.externalJobDetails.providerKind, input.providerKind),
        or(...fileIdMatches),
      ),
    )
    .orderBy(desc(schema.jobs.updatedAt), desc(schema.jobs.id))
    .limit(100);

  return rows;
}
