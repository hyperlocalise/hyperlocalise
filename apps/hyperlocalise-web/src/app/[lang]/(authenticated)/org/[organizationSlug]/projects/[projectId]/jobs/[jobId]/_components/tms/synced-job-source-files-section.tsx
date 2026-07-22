"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useMemo } from "react";
import { useIntl } from "react-intl";

import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import type { ProviderSourceFile } from "../job-provider-detail-section";
import { providerSourceFileToProjectFileRecord } from "./job-source-file-mappers";
import { JobSourceFilesPanel } from "./job-source-files-panel";
import type { CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";
import { syncedJobSourceFilesSectionMessages as messages } from "./synced-job-source-files-section.messages";

export function SyncedJobSourceFilesSection({
  organizationSlug,
  projectId,
  encodedJobId,
  providerKind,
  sourceFiles,
  highlightLocale,
  queueFilter,
}: {
  organizationSlug: string;
  projectId: string;
  encodedJobId: string;
  providerKind: string;
  sourceFiles: ProviderSourceFile[];
  highlightLocale?: string | null;
  queueFilter?: CatQueueFilter;
}) {
  const intl = useIntl();
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
      encodedJobId={encodedJobId}
      files={files}
      emptyMessage={intl.formatMessage(messages.noSourceFilesLinked)}
      highlightLocale={highlightLocale ?? null}
      queueFilter={queueFilter}
    />
  );
}
