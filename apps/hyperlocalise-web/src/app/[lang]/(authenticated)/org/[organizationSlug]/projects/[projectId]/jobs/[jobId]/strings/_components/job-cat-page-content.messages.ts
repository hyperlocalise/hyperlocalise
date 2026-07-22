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
import { defineMessages } from "react-intl";

export const jobCatPageContentMessages = defineMessages({
  loadingWorkspace: {
    defaultMessage: "Loading workspace…",
    id: "I6/kYi4M/3",
    description: "Loading state while the job CAT workspace is preparing",
  },
  openingWorkspace: {
    defaultMessage: "Opening workspace…",
    id: "HbZmRDMHs3",
    description: "Loading state while navigating into the job CAT workspace",
  },
  unableToLoadTaskFiles: {
    defaultMessage: "Unable to load task files.",
    id: "ZLaHigyIGc",
    description: "Fallback error when job CAT task files fail to load",
  },
  noTargetLocaleSpecified: {
    defaultMessage: "No target locale is specified for this task.",
    id: "L402PDLeoZ",
    description: "Empty state when the job has files but no target locale query param",
  },
  noSourceFileLinked: {
    defaultMessage: "No source file is linked to this task.",
    id: "3yxRiqmgnG",
    description: "Empty state when the job has no linked source file for CAT",
  },
  noTargetLocaleForTask: {
    defaultMessage: "No target locale is available for this task.",
    id: "enjVtZumks",
    description: "Empty state when all-files CAT mode has no selectable target locale",
  },
  noTargetLocaleForTaskFile: {
    defaultMessage: "No target locale is available for this task file.",
    id: "c0YVbiffzK",
    description: "Empty state when a native job CAT file has no target locale",
  },
  noTargetLocaleForProviderFile: {
    defaultMessage: "No target locale is available for this provider task file.",
    id: "hCivyG+QTC",
    description: "Empty state when a provider job CAT file has no target locale",
  },
  projectMissingSourceLocale: {
    defaultMessage: "This project does not have a source locale.",
    id: "DQ07Hv8A9f",
    description: "Error when the project has no configured source locale for CAT",
  },
  repositoriesLoadFailed: {
    defaultMessage:
      "GitHub repositories could not be loaded. Repository context lookup is unavailable.",
    id: "9c0o1d89j+",
    description: "Banner when GitHub repositories fail to load on the job CAT page",
  },
  selectRepositoryForContext: {
    defaultMessage: "Select a GitHub repository to look up string context.",
    id: "GnhXacyqeM",
    description: "Banner prompting the user to pick a repository for CAT context lookup",
  },
  listTruncated: {
    defaultMessage:
      "This project has more than {fetchedCount, number} files, so the source file could not be resolved from the loaded file list. Open CAT from the project Files page instead, or ask support to narrow the project file list.",
    id: "LWxfVFhHEJ",
    description:
      "Error when the project file list was truncated before the CAT source file could be found",
  },
  sourceFileNoLongerLinked: {
    defaultMessage: "This source file is not linked to the task anymore.",
    id: "3Ze8wX3xRS",
    description: "Empty state when the requested CAT source file is missing from the job",
  },
  stringEditingUnsupported: {
    defaultMessage: "String editing is only available for supported provider task files.",
    id: "BGQKZth3v0",
    description: "Empty state when the selected provider file cannot open in CAT",
  },
  providerKindAndFormat: {
    defaultMessage: "{kind} · {format}",
    id: "j7qlYfJ6Qt",
    description: "Provider kind and file format shown in the job CAT header",
  },
  fileFormatFallback: {
    defaultMessage: "file",
    id: "B9aG0nitRg",
    description: "Fallback label when a provider task file has no format metadata",
  },
});
