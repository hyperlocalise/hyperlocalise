"use client";

import { useMemo } from "react";

import { parseProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

import type { ProviderSourceFile } from "../job-provider-detail-section";
import { providerSourceFileToProjectFileRecord } from "./job-source-file-mappers";
import { JobSourceFilesPanel } from "./job-source-files-panel";

export function SyncedJobSourceFilesSection({
  organizationSlug,
  projectId,
  providerKind,
  sourceFiles,
  highlightLocale,
}: {
  organizationSlug: string;
  projectId: string;
  providerKind: string;
  sourceFiles: ProviderSourceFile[];
  highlightLocale?: string | null;
}) {
  const encodedProjectId = parseProviderProjectId(projectId);
  const externalProjectId = encodedProjectId?.externalProjectId ?? projectId;

  const files = useMemo(
    () =>
      sourceFiles.flatMap((file) => {
        const record = providerSourceFileToProjectFileRecord(file, providerKind, externalProjectId);
        return record ? [record] : [];
      }),
    [externalProjectId, providerKind, sourceFiles],
  );

  return (
    <JobSourceFilesPanel
      organizationSlug={organizationSlug}
      projectId={projectId}
      files={files}
      emptyMessage="No synced source files linked to this job."
      highlightLocale={highlightLocale ?? null}
    />
  );
}
