"use client";

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
import type {
  ProjectFileContentEditorQueueFilter,
  ProjectFileContentEditorQueueSort,
} from "@/api/routes/project/project.schema";
import type { ContentEditorFormatMessageIntl } from "@/components/content-editor/message-format/content-editor-message-format-i18n";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { collectCatFilteredExportRows } from "@/components/content-editor/project-file/content-editor-filtered-export-collect";
import { isErr } from "@/lib/primitives/result/results";
import {
  buildCatFilteredExportFilename,
  type ContentEditorFilteredExportFormat,
} from "@/lib/projects/content-editor/content-editor-filtered-export";
import { serializeEditorFilteredExportViaGoSvc } from "@/lib/projects/content-editor/editor-export-gosvc";

import { projectFileCatApiMessages } from "./project-file-content-editor-api.messages";

export async function downloadProjectFileContentEditorExport(input: {
  goSvcClient: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  sourceLocale: string;
  format: ContentEditorFilteredExportFormat;
  search: string;
  queueFilter: ProjectFileContentEditorQueueFilter;
  queueSort?: ProjectFileContentEditorQueueSort;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  sourcePaths?: string | null;
  intl: ContentEditorFormatMessageIntl;
}) {
  const collected = await collectCatFilteredExportRows({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    sourceLocale: input.sourceLocale,
    search: input.search,
    queueFilter: input.queueFilter,
    queueSort: input.queueSort,
    externalResourceId: input.externalResourceId,
    resourceType: input.resourceType,
    sourcePaths: input.sourcePaths,
    intl: input.intl,
    goSvcClient: input.goSvcClient,
  });

  if (collected.kind === "empty") {
    throw new Error(input.intl.formatMessage(projectFileCatApiMessages.filteredExportEmpty));
  }

  const serialized = await serializeEditorFilteredExportViaGoSvc(input.goSvcClient, {
    format: input.format,
    rows: collected.rows,
  });

  if (isErr(serialized)) {
    const fallback = input.intl.formatMessage(projectFileCatApiMessages.failedToExportQueue);
    throw new Error(
      serialized.error.code === "export_service_unavailable"
        ? serialized.error.message
        : serialized.error.message || fallback,
    );
  }

  const { body, extension } = serialized.value;
  const filename = buildCatFilteredExportFilename({
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    extension,
  });

  const blob = new Blob([Uint8Array.from(body)], { type: serialized.value.contentType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);

  if (collected.truncated) {
    console.warn(`Filtered export truncated at ${collected.rows.length} segments (server limit).`);
  }
}
