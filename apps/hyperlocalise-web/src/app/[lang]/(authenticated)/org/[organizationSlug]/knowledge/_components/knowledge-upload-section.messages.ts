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
import { defineMessages } from "react-intl";

export const knowledgeUploadSectionMessages = defineMessages({
  title: {
    defaultMessage: "Upload knowledge",
    id: "GWQDU8Wxgx",
    description: "Heading for the knowledge upload empty state",
  },
  dropHint: {
    defaultMessage: "Drag & drop or {chooseFiles} to upload.",
    id: "FMmgKTpwGA",
    description: "Primary dropzone hint for knowledge file upload",
  },
  chooseFiles: {
    defaultMessage: "choose a file",
    id: "9CNd/xgJVL",
    description: "Clickable label inside the knowledge upload dropzone hint",
  },
  formats: {
    defaultMessage:
      "Supported formats: .csv, .json, .pdf, .xlsx, .xls, .txt, .md, .docx, .pptx. Max 1 file per upload.",
    id: "vVxZW3OWeO",
    description: "Supported formats and file limit for knowledge upload",
  },
  or: {
    defaultMessage: "or",
    id: "bl+DouTlcU",
    description: "Separator between knowledge upload dropzone and source buttons",
  },
  selectedFiles: {
    defaultMessage: "{count, plural, one {# file selected} other {# files selected}}",
    id: "80QeJXvhPz",
    description: "Count of files selected in the knowledge upload dropzone",
  },
  googleDrive: {
    defaultMessage: "Add Google Drive",
    id: "BCjCYwwMon",
    description: "Button to add knowledge from Google Drive",
  },
  sharepoint: {
    defaultMessage: "Add Sharepoint",
    id: "Ewbt8MWcWy",
    description: "Button to add knowledge from SharePoint",
  },
  notion: {
    defaultMessage: "Add Notion",
    id: "i2TQ8zUvre",
    description: "Button to add knowledge from Notion",
  },
  importWebsite: {
    defaultMessage: "Import website",
    id: "I7cGK7f56O",
    description: "Button to import knowledge from a website",
  },
  markdownText: {
    defaultMessage: "Markdown/Text",
    id: "wE0HX7UKYn",
    description: "Button to start a blank markdown knowledge memory document",
  },
  comingSoon: {
    defaultMessage: "Coming soon",
    id: "tHRdoBNZAG",
    description: "Toast when a knowledge upload integration is not available yet",
  },
  tooManyFiles: {
    defaultMessage: "You can upload 1 file at a time.",
    id: "zSP+9VJuxd",
    description: "Toast when more than one knowledge upload file is selected",
  },
  unsupportedFiles: {
    defaultMessage: "That file type is not supported. Use a supported format.",
    id: "pJSZRmHIFC",
    description: "Toast when the selected knowledge upload file uses an unsupported format",
  },
});
