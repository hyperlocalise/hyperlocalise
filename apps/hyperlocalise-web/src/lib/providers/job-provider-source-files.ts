import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import { resolveEncodedProviderJobId } from "@/lib/providers/tms-provider-resource-id";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export type ProviderSourceFileRecord = {
  id: string;
  displayName: string;
  sourcePath: string | null;
  resourceType: string | null;
  externalUrl: string | null;
};

type LiveProviderFileLike = {
  sourcePath: string;
  filename: string;
  provider?: {
    externalResourceId?: string;
    resourceType?: string | null;
    externalUrl?: string | null;
  } | null;
};

export function extractProviderFileIds(
  providerPayload: Record<string, unknown> | null | undefined,
) {
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

export type ProviderAgentRunSourceFileRef = {
  id: string;
  displayName: string;
  sourcePath: string | null;
  resourceType?: string | null;
  externalUrl?: string | null;
};

export function readProviderPayloadFromInputSnapshot(
  inputSnapshot: Record<string, unknown> | null | undefined,
) {
  const payload = inputSnapshot?.providerPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}

export function readProviderAgentRunSourceFilesFromSnapshot(
  inputSnapshot: Record<string, unknown> | null | undefined,
): ProviderAgentRunSourceFileRef[] {
  const sourceFiles = inputSnapshot?.sourceFiles;
  if (!Array.isArray(sourceFiles)) {
    return [];
  }

  return sourceFiles.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    if (!id) {
      return [];
    }

    return [
      {
        id,
        displayName: typeof record.displayName === "string" ? record.displayName : id,
        sourcePath: typeof record.sourcePath === "string" ? record.sourcePath : null,
        resourceType: typeof record.resourceType === "string" ? record.resourceType : null,
        externalUrl: typeof record.externalUrl === "string" ? record.externalUrl : null,
      },
    ];
  });
}

export async function resolveProviderAgentRunSourceFiles(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  inputSnapshot: Record<string, unknown>;
  syncedProviderPayload?: Record<string, unknown> | null;
}) {
  const explicitSourceFiles = readProviderAgentRunSourceFilesFromSnapshot(input.inputSnapshot);
  if (explicitSourceFiles.some((file) => Boolean(file.sourcePath?.trim()))) {
    return explicitSourceFiles;
  }

  const providerPayload =
    input.syncedProviderPayload ?? readProviderPayloadFromInputSnapshot(input.inputSnapshot);
  if (!providerPayload) {
    return explicitSourceFiles;
  }

  return resolveProviderSourceFiles({
    organizationId: input.organizationId,
    projectId: input.projectId,
    providerKind: input.providerKind,
    providerPayload,
  });
}

export function mapLiveProviderFilesToProviderSourceFiles(
  files: LiveProviderFileLike[],
): ProviderSourceFileRecord[] {
  return files.map((file) => ({
    id: file.provider?.externalResourceId ?? file.sourcePath,
    displayName: file.filename,
    sourcePath: file.sourcePath,
    resourceType: file.provider?.resourceType ?? null,
    externalUrl: file.provider?.externalUrl ?? null,
  }));
}

export async function resolveProviderSourceFilesForJob(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  providerPayload: Record<string, unknown> | null | undefined;
  jobId: string;
  externalJobId: string | null;
  externalTaskId: string | null;
  actorUserId?: string | null;
}): Promise<ProviderSourceFileRecord[]> {
  const encodedJobId = resolveEncodedProviderJobId({
    jobId: input.jobId,
    projectId: input.projectId,
    externalProviderKind: input.providerKind,
    externalJobId: input.externalJobId,
    externalTaskId: input.externalTaskId,
  });

  if (encodedJobId) {
    try {
      const { listTmsProviderLiveJobFiles } = await import("@/lib/providers/tms-provider-live");
      const liveFiles = await listTmsProviderLiveJobFiles(input.organizationId, encodedJobId, {
        actorUserId: input.actorUserId,
      });

      if (liveFiles !== null) {
        return mapLiveProviderFilesToProviderSourceFiles(liveFiles);
      }
    } catch (err) {
      // Fall back to synced resolution below.
      console.warn(
        "[job-provider-source-files] live file fetch failed, falling back to synced resolution",
        { jobId: input.jobId, providerKind: input.providerKind, err },
      );
    }
  }

  return resolveProviderSourceFiles({
    organizationId: input.organizationId,
    projectId: input.projectId,
    providerKind: input.providerKind,
    providerPayload: input.providerPayload,
  });
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
  const expressions = [
    sql`${schema.externalJobDetails.providerPayload}->'fileIds' @> ${JSON.stringify([externalResourceId])}::jsonb`,
  ];

  if (!Number.isNaN(numericId)) {
    expressions.push(
      sql`${schema.externalJobDetails.providerPayload}->'fileIds' @> ${JSON.stringify([numericId])}::jsonb`,
    );
  }

  return expressions;
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
