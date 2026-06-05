import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { TmsProviderLiveFile } from "@/lib/providers/tms-provider-live";

import type { ProviderSourceFile } from "../job-provider-detail-section";

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
    uploadedAt: new Date().toISOString(),
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
      targetLocales: [],
      localeReadiness: {},
      revision: null,
      format: null,
      lastSyncedAt: null,
    },
    latestJob: null,
  };
}
