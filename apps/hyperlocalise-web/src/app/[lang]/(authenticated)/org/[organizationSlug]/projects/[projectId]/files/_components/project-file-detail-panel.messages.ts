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
import { defineMessages } from "react-intl";

export const projectFileDetailPanelMessages = defineMessages({
  fileNotFound: {
    defaultMessage: "File not found",
    id: "jxJKm8SzyI",
    description: "Title when the requested project file path is missing from the list",
  },
  fileNotFoundDescription: {
    defaultMessage:
      "This path is not in the project file list. It may have been removed or the link is outdated.",
    id: "kjARwbM4Nd",
    description: "Explanation when a requested project file path cannot be found",
  },
  selectFile: {
    defaultMessage: "Select a file",
    id: "lHKw2e6/kS",
    description: "Empty-state title when no project file is selected in the detail panel",
  },
  selectFileDescription: {
    defaultMessage: "Choose a file from the list to view its metadata and related jobs.",
    id: "YH85ceiP7j",
    description: "Empty-state description when no project file is selected",
  },
  loadingFile: {
    defaultMessage: "Loading file…",
    id: "4B3q4D8+NF",
    description: "Loading state while project file details are fetched",
  },
  loadDetailsFailed: {
    defaultMessage: "Failed to load file details.",
    id: "XN1TGsoctn",
    description: "Fallback error when project file details fail to load",
  },
  loadDetailsFailedShort: {
    defaultMessage: "Failed to load file details",
    id: "HJp07FJaQu",
    description: "Fallback API error when project file details fail to load",
  },
  loadProjectFailed: {
    defaultMessage: "Failed to load project",
    id: "Vq0Rk5ZFcw",
    description: "Fallback API error when project settings fail to load for file details",
  },
  latestJob: {
    defaultMessage: "Latest job · {status}",
    id: "0su3rYbABy",
    description: "Badge showing the latest translation job status for a native file",
  },
  uploaded: {
    defaultMessage: "Uploaded",
    id: "KC1mEy5GJx",
    description: "Badge when a native project file has no latest job",
  },
  revision: {
    defaultMessage: "revision {revision}",
    id: "8jmFMvrCLC",
    description: "File metadata fragment showing the revision identifier",
  },
  updatedAt: {
    defaultMessage: "Updated {date}",
    id: "43koQMqx25",
    description: "File metadata fragment showing the last updated date",
  },
  hash: {
    defaultMessage: "Hash {hash}",
    id: "Szu3mcKAYD",
    description: "Shows the source content hash for a project file version",
  },
  format: {
    defaultMessage: "Format {format}",
    id: "omP7hSnBIw",
    description: "Shows the provider file format in the file detail panel",
  },
  sourceLocale: {
    defaultMessage: "Source {locale}",
    id: "PoNN6ffaMf",
    description: "Shows the provider source locale in the file detail panel",
  },
  targets: {
    defaultMessage: "Targets {locales}",
    id: "shk3PWB9yz",
    description: "Shows the provider target locales in the file detail panel",
  },
  translateWithAgent: {
    defaultMessage: "Translate with agent",
    id: "Wq2O6lVhWX",
    description: "Button to open the translate-with-agent dialog from file details",
  },
  importTranslations: {
    defaultMessage: "Import translations",
    id: "vaYZPzJaH1",
    description: "Button to open the import translations dialog from file details",
  },
  downloadLocale: {
    defaultMessage: "Download {locale}",
    id: "whTnlyYlKA",
    description: "Button to download translations for a specific locale",
  },
  jobsByLocale: {
    defaultMessage: "Jobs by locale",
    id: "lEAnS9LFlv",
    description: "Section heading for jobs grouped by locale in the file detail panel",
  },
});
