"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { IntlShape } from "react-intl";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { dedupeLiveFilesBySourcePath } from "@/lib/providers/jobs/tms-provider-live-file-dedupe";

import { projectFilesSharedMessages } from "./project-files-shared.messages";

export function formatBytes(bytes: number | null, intl: IntlShape) {
  if (bytes === null) {
    return intl.formatMessage(projectFilesSharedMessages.unknownSize);
  }
  if (bytes === 0) {
    return intl.formatMessage(projectFilesSharedMessages.zeroBytes);
  }

  const units = [
    projectFilesSharedMessages.unitB,
    projectFilesSharedMessages.unitKB,
    projectFilesSharedMessages.unitMB,
    projectFilesSharedMessages.unitGB,
  ] as const;
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return intl.formatMessage(projectFilesSharedMessages.byteSize, {
    value: Number((bytes / 1024 ** unitIndex).toFixed(1)),
    unit: intl.formatMessage(units[unitIndex]),
  });
}

export function dedupeProjectFilesBySourcePath(files: ProjectFileRecord[]): ProjectFileRecord[] {
  return dedupeLiveFilesBySourcePath(files);
}
