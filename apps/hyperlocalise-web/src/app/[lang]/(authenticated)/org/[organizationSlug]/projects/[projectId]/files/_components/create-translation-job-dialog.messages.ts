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

export const createTranslationJobDialogMessages = defineMessages({
  title: {
    defaultMessage: "Translate with agent",
    id: "u8IfkaHCSY",
    description: "Title of the create translation job dialog",
  },
  description: {
    defaultMessage: "Queue an AI translation agent for {path}.",
    id: "A1hnwLDiLO",
    description: "Description of the create translation job dialog, with the source file path",
  },
  thisFile: {
    defaultMessage: "this file",
    id: "dEC5aeY5Wt",
    description: "Fallback path label when the source file path is missing",
  },
  noTargetLocales: {
    defaultMessage: "Add target locales in project settings before creating translation jobs.",
    id: "/hT2cIKUSb",
    description: "Hint when the project has no target locales configured for agent translation",
  },
  sourceLocale: {
    defaultMessage: "Source locale: {locale}",
    id: "2RA1MDUmR3",
    description: "Shows the project source locale in the create translation job dialog",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "v1ru55p+vf",
    description: "Cancel button in the create translation job dialog footer",
  },
  submit: {
    defaultMessage: "Translate with agent",
    id: "ODozvMZNye",
    description: "Submit button in the create translation job dialog footer",
  },
  uploadSourceRequired: {
    defaultMessage: "Upload a source file before creating a translation job.",
    id: "GAAFtsnydJ",
    description: "Validation error when creating a job without a stored source file",
  },
  unsupportedFormat: {
    defaultMessage: "This file format is not supported for translation jobs.",
    id: "vX1tuXTEO/",
    description: "Validation error when the source file format cannot be translated",
  },
  localesRequired: {
    defaultMessage: "Select at least one target locale.",
    id: "8kFDR1/eiv",
    description: "Validation error when creating a translation job without target locales",
  },
  createFailed: {
    defaultMessage: "Failed to create translation job",
    id: "c5EgJTB1mI",
    description: "Fallback error when creating a translation job fails",
  },
  createSuccess: {
    defaultMessage: "Translation agent is running",
    id: "Q5whbwkMF+",
    description: "Toast when a translation agent job is created successfully",
  },
});
