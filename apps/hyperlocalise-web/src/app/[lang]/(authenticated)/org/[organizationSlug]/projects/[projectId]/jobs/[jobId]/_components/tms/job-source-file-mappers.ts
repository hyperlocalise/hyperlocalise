import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { TmsProviderLiveFile } from "@/lib/providers/tms-provider-live";

import type { JobDetailRecord } from "../job-detail-types";
import type { ProviderSourceFile } from "../job-provider-detail-section";

function getInputPayloadString(job: JobDetailRecord, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return null;
  }

  const value = (job.inputPayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function nativeJobToProjectFileRecord(job: JobDetailRecord): ProjectFileRecord | null {
  const sourcePath = getInputPayloadString(job, "sourceFileId");
  if (!sourcePath) {
    return null;
  }

  const filename = sourcePath.split("/").filter(Boolean).at(-1) ?? sourcePath;

  return {
    origin: "repository",
    sourcePath,
    sourceHash: null,
    commitSha: null,
    workflowRunId: job.workflowRunId,
    uploadedAt: job.createdAt,
    storedFileId: sourcePath,
    metadata: {},
    filename,
    byteSize: null,
    provider: null,
    latestJob: {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      type: job.type ?? "file",
    },
  };
}

export function tmsLiveFileToProjectFileRecord(file: TmsProviderLiveFile): ProjectFileRecord {
  return {
    origin: file.origin,
    sourcePath: file.sourcePath,
    sourceHash: file.sourceHash,
    commitSha: file.commitSha,
    workflowRunId: file.workflowRunId,
    uploadedAt: file.uploadedAt,
    storedFileId: file.storedFileId,
    metadata: file.metadata,
    filename: file.filename,
    byteSize: file.byteSize,
    provider: file.provider,
    latestJob: file.latestJob,
  };
}

export function providerSourceFileToProjectFileRecord(
  file: ProviderSourceFile,
  providerKind: string,
  externalProjectId: string,
  targetLocales: readonly string[] = [],
): ProjectFileRecord | null {
  if (!file.sourcePath) {
    return null;
  }

  return {
    origin: "provider",
    sourcePath: file.sourcePath,
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: new Date(0).toISOString(),
    storedFileId: null,
    metadata: {},
    filename: file.displayName,
    byteSize: null,
    provider: {
      kind: providerKind as ExternalTmsProviderKind,
      resourceType: (file.resourceType ?? "file") as "file" | "key",
      externalProjectId,
      externalResourceId: file.id,
      externalUrl: file.externalUrl,
      syncState: "synced",
      sourceLocale: null,
      targetLocales: [...targetLocales],
      localeReadiness: {},
      revision: null,
      format: null,
      lastSyncedAt: null,
    },
    latestJob: null,
  };
}
