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

export const projectFileCatPageContentMessages = defineMessages({
  chooseSourceFile: {
    defaultMessage:
      "Choose a source file from the project files list to open it in the CAT workspace.",
    id: "4jWhf0M3TR",
    description: "Empty state when the CAT page is opened without a source file",
  },
  files: {
    defaultMessage: "Files",
    id: "uD+YA/1xKz",
    description: "Link back to the project files list from the CAT page",
  },
  loadingFile: {
    defaultMessage: "Loading file…",
    id: "8Aop7svU4q",
    description: "Loading state while the project file CAT page prepares",
  },
  unableToLoad: {
    defaultMessage: "Unable to load project files.",
    id: "F7I6G7lNye",
    description: "Fallback error when the project file CAT page fails to load data",
  },
  sourceFileMissing: {
    defaultMessage: "This source file is not in the project file list anymore.",
    id: "93RU1YIXH5",
    description: "Empty state when the requested CAT source file is missing from the project",
  },
  providerTypeUnsupported: {
    defaultMessage: "The CAT workspace is not available for this provider file type yet.",
    id: "3EJ5L34UDR",
    description: "Empty state when a provider file type cannot open in CAT",
  },
  chooseTargetLocale: {
    defaultMessage: "Choose a target locale to open this file in the CAT workspace.",
    id: "VzzqUlIKvt",
    description: "Empty state when no target locale is available for the CAT file",
  },
  missingSourceLocale: {
    defaultMessage: "This project does not have a source locale.",
    id: "DQ07Hv8A9f",
    description: "Error when the project has no configured source locale for CAT",
  },
  repositoriesLoadFailed: {
    defaultMessage:
      "GitHub repositories could not be loaded. Repository context lookup is unavailable.",
    id: "vVZw2DPBm7",
    description: "Banner when GitHub repositories fail to load on the project file CAT page",
  },
  selectRepositoryForContext: {
    defaultMessage: "Select a GitHub repository to look up string context.",
    id: "GnhXacyqeM",
    description: "Banner prompting the user to pick a repository for CAT context lookup",
  },
  localeFallback: {
    defaultMessage:
      "{requestedLocale} is not a target locale for this file. Showing {targetLocale} instead.",
    id: "9RzqUudO7g",
    description: "Banner when CAT shows a fallback target locale",
  },
  providerKindAndFormat: {
    defaultMessage: "{kind} · {format}",
    id: "oS7mysSU95",
    description: "Shows the provider kind and file format in the CAT page header",
  },
  providerFormatFallback: {
    defaultMessage: "file",
    id: "gSVYd4jPtI",
    description: "Fallback format label when a provider file has no format metadata",
  },
  loadRepositoriesFailed: {
    defaultMessage: "Failed to load GitHub repositories",
    id: "P83ZEtDAlo",
    description: "Fallback error when GitHub repositories fail to load for CAT context",
  },
});
