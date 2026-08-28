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
  ProjectFileCatQueueFilter,
  ProjectFileCatQueueSort,
} from "@/api/routes/project/project.schema";
import type { CatFormatMessageIntl } from "@/components/cat/message-format/cat-message-format-i18n";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import type { CatFilteredExportFormat } from "@/lib/projects/cat/cat-filtered-export";

import { projectFileCatApiMessages } from "./project-file-cat-api.messages";

function parseContentDispositionFilename(header: string | null) {
  if (!header) {
    return null;
  }

  const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

export async function downloadProjectFileCatExport(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  sourceLocale: string;
  format: CatFilteredExportFormat;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  queueSort?: ProjectFileCatQueueSort;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  sourcePaths?: string | null;
  intl: CatFormatMessageIntl;
}) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat.export.$get({
    param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
    query: {
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      sourceLocale: input.sourceLocale,
      format: input.format,
      ...(input.externalResourceId ? { externalResourceId: input.externalResourceId } : {}),
      ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      ...(input.sourcePaths ? { sourcePaths: input.sourcePaths } : {}),
      ...(input.search ? { search: input.search } : {}),
      ...(input.queueFilter !== "all" ? { queueFilter: input.queueFilter } : {}),
      ...(input.queueSort && input.queueSort !== "file_order"
        ? { queueSort: input.queueSort }
        : {}),
    },
  });

  if (response.status !== 200) {
    throw new Error(
      await readApiError(
        response,
        input.intl.formatMessage(projectFileCatApiMessages.failedToExportQueue),
      ),
    );
  }

  const blob = await response.blob();
  const filename =
    parseContentDispositionFilename(response.headers.get("Content-Disposition")) ??
    `cat-export-${input.targetLocale}.${input.format === "xliff" ? "xliff" : input.format}`;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
