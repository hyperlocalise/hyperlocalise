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

export const projectFilesTreePanelMessages = defineMessages({
  projectFilesTitle: {
    defaultMessage: "Project files",
    id: "uoCjhyUZ2p",
    description: "Title of the project files tree panel",
  },
  loading: {
    defaultMessage: "Loading…",
    id: "dvQ8V/bntk",
    description: "Short loading status under the project files tree panel title",
  },
  couldNotLoad: {
    defaultMessage: "Could not load files",
    id: "jgZ/X83sNj",
    description: "Status under the project files tree panel title when loading fails",
  },
  fileCount: {
    defaultMessage: "{count, plural, one {# file} other {# files}}",
    id: "33h6LWiVo9",
    description: "Count of project files shown in the tree panel header",
  },
  fileCountMore: {
    defaultMessage: "{count}+ files",
    id: "rLQERYPxKy",
    description: "Count when more project files are available beyond the loaded page",
  },
  loadingFiles: {
    defaultMessage: "Loading files…",
    id: "e8ygO/tdr3",
    description: "Loading state body while project files are fetched",
  },
  noFilesYet: {
    defaultMessage: "No files yet",
    id: "0DSwLmDrDB",
    description: "Empty-state title when the project has no files",
  },
  noProviderFiles: {
    defaultMessage: "No provider files were found for this project.",
    id: "rh4QHX9qYb",
    description: "Empty-state description for provider projects with no files",
  },
  noNativeFiles: {
    defaultMessage:
      "Use Add files above to upload JSON, YAML, XLIFF, PO, and other supported formats.",
    id: "nZi7NhrmPT",
    description: "Empty-state description for native projects with no uploaded files",
  },
  loadMore: {
    defaultMessage: "Load more files",
    id: "MFBsxdpfed",
    description: "Button to load the next page of project files",
  },
  loadingMore: {
    defaultMessage: "Loading more…",
    id: "YkWm74hjVM",
    description: "Button label while the next page of project files is loading",
  },
  loadFailed: {
    defaultMessage: "Failed to load project files",
    id: "i2cbaLeWDA",
    description: "Fallback API error when the project files list fails to load",
  },
});
