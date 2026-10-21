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

export const translateLocaleWithAgentDialogMessages = defineMessages({
  title: {
    defaultMessage: "Translate {locale} with agent",
    id: "ZkYSjdsJm0",
    description: "Title of the dialog that queues agent translation for one project locale",
  },
  description: {
    defaultMessage:
      "The agent translates empty and rejected {locale} strings across the project. Existing translations stay.",
    id: "l7sI2wsmUk",
    description: "Explains what translating a whole locale with the agent does",
  },
  fileCount: {
    defaultMessage: "{count, plural, one {# file will be queued} other {# files will be queued}}",
    id: "pbk0Y3fdPe",
    description: "Number of project files that will get an agent translation job",
  },
  loadingFiles: {
    defaultMessage: "Loading project files…",
    id: "zoDiURFcrJ",
    description: "Shown while project files load in the translate locale with agent dialog",
  },
  loadFilesFailed: {
    defaultMessage: "Unable to load project files.",
    id: "tCfUqtibAE",
    description: "Error when project files fail to load in the translate locale with agent dialog",
  },
  noFiles: {
    defaultMessage: "Upload a supported source file before translating with the agent.",
    id: "fRdqS+8PYa",
    description: "Shown when the project has no files the agent can translate",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "RG54JW496Z",
    description: "Cancel button in the translate locale with agent dialog",
  },
  submit: {
    defaultMessage: "Translate with agent",
    id: "A63A7LDcoP",
    description: "Submit button in the translate locale with agent dialog",
  },
  createSuccess: {
    defaultMessage:
      "{count, plural, one {Translation agent queued for # file} other {Translation agent queued for # files}}",
    id: "V5oxauHGks",
    description: "Toast after agent translation jobs are queued for a locale",
  },
  createPartial: {
    defaultMessage: "Queued {createdCount} of {totalCount} files. {errorMessage}",
    id: "RbwdCI0t1G",
    description: "Toast when only some agent translation jobs were queued for a locale",
  },
  createFailed: {
    defaultMessage: "Failed to queue the translation agent",
    id: "KRtI4pu0rs",
    description: "Fallback error when agent translation jobs cannot be queued for a locale",
  },
});
