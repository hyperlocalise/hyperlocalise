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

export const projectFilesPageContentMessages = defineMessages({
  sectionTitle: {
    defaultMessage: "Files",
    id: "kvA8//3BBl",
    description: "Section title for the project files page",
  },
  descriptionProvider: {
    defaultMessage:
      "Browse source files from the connected TMS provider, then open one in the CAT workspace when it is supported.",
    id: "EuTWCTh8wL",
    description: "Project files page description for provider-backed projects",
  },
  descriptionNative: {
    defaultMessage:
      "Upload source files, then open one in the CAT workspace to review and edit translations.",
    id: "uzkJ9jkLaR",
    description: "Project files page description for native Hyperlocalise projects",
  },
  addFiles: {
    defaultMessage: "Add files",
    id: "Zh1+GZ3Hje",
    description: "Button to choose source files for upload",
  },
  readyToUpload: {
    defaultMessage: "Ready to upload",
    id: "DPeiBFpfQD",
    description: "Title of the pending file upload section",
  },
  filesSelected: {
    defaultMessage:
      "{count, plural, one {# file selected (max {max}).} other {# files selected (max {max}).}}",
    id: "eETDpPUyD4",
    description: "Count of files staged for upload with the maximum allowed",
  },
  uploading: {
    defaultMessage: "Uploading…",
    id: "q3g6c65hVD",
    description: "Upload button label while files are uploading",
  },
  upload: {
    defaultMessage: "Upload",
    id: "0K98KjAVAs",
    description: "Button to upload the staged source files",
  },
  remove: {
    defaultMessage: "Remove",
    id: "pMpF//U8ui",
    description: "Button to remove a staged file from the upload list",
  },
  projectFilesTitle: {
    defaultMessage: "Project files",
    id: "gXiv06K7yv",
    description: "Title of the project files list section",
  },
  loading: {
    defaultMessage: "Loading…",
    id: "fmoDfLltk/",
    description: "Short loading status under the project files list title",
  },
  couldNotLoad: {
    defaultMessage: "Could not load files",
    id: "Ti9Gb8n4Gh",
    description: "Status under the project files list title when loading fails",
  },
  fileCount: {
    defaultMessage: "{count, plural, one {# file} other {# files}}",
    id: "RjFpl2Iinv",
    description: "Count of project files in the list header",
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
  filesFailedToLoad: {
    defaultMessage: "Files failed to load.",
    id: "fsj2SHFeSt",
    description: "Error title when the project files list fails to load",
  },
  loadFailedFallback: {
    defaultMessage: "Failed to load files.",
    id: "9crjwN89e0",
    description: "Fallback error when project files fail without a detailed message",
  },
  uploadFileFailed: {
    defaultMessage: "Failed to upload {sourcePath}",
    id: "jW4nG0Rt7y",
    description: "Fallback API error when a specific source file upload fails",
  },
  uploadSuccess: {
    defaultMessage: "{count, plural, one {File uploaded} other {# files uploaded}}",
    id: "eJpbr2p2dc",
    description: "Toast after source files upload successfully",
  },
  uploadFailed: {
    defaultMessage: "Failed to upload files",
    id: "VXMF06lvLo",
    description: "Fallback toast when source file upload fails",
  },
  cannotOpenCat: {
    defaultMessage: "This file can’t be opened in the CAT workspace.",
    id: "mwlaVsXCWL",
    description: "Toast when a selected file cannot open in the CAT workspace",
  },
  noTargetLocale: {
    defaultMessage: "No target locale is available for this file.",
    id: "zVQz/HoyEL",
    description: "Toast or hint when a file has no usable target locale for CAT",
  },
  localeFallbackToast: {
    defaultMessage:
      "{requestedLocale} is not a target locale for this file. Opening {targetLocale} instead.",
    id: "G2WzhHiN3d",
    description: "Warning toast when CAT opens a fallback target locale",
  },
  localeFallbackHint: {
    defaultMessage:
      "{requestedLocale} is not a target locale for this file. Double-click a file or use View strings to open the CAT workspace for {targetLocale}.",
    id: "2Wf+R5t111",
    description: "Hint when the requested locale is unavailable and a fallback will be used",
  },
  openCatHint: {
    defaultMessage:
      "Double-click a file or use View strings to open the CAT workspace for {targetLocale}.",
    id: "eHWGrpWi9b",
    description: "Hint explaining how to open the selected file in the CAT workspace",
  },
});
