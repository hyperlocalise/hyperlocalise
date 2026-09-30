/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { resolveNativeJobSourceFileDisplay } from "@/lib/projects/jobs/native-job-source-file-display";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { TmsProviderLiveFile } from "@/lib/providers/jobs/tms-provider-live";

import type { JobDetailRecord } from "../job-detail-types";
import type { ProviderSourceFile } from "../job-provider-detail-section";

export function nativeJobToProjectFileRecord(job: JobDetailRecord): ProjectFileRecord | null {
  const display = resolveNativeJobSourceFileDisplay({
    inputPayload: job.inputPayload,
    sourceFilename: job.sourceFilename,
    sourcePath: job.sourcePath,
  });
  if (!display) {
    return null;
  }

  return {
    origin: "repository",
    sourcePath: display.sourcePath,
    sourceHash: null,
    commitSha: null,
    workflowRunId: job.workflowRunId,
    uploadedAt: job.createdAt,
    storedFileId: display.storedFileId,
    metadata: {},
    filename: display.filename,
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
