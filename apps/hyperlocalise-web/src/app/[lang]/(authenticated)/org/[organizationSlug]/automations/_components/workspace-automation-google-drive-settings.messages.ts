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

export const workspaceAutomationGoogleDriveSettingsMessages = defineMessages({
  helper: {
    id: "F7ZgJp7s7N",
    defaultMessage:
      "Choose from folders and files already connected on the Integrations page. Project source and target locales come from the attached project.",
    description: "Helper text for Google Drive tool config on an automation",
  },
  translationOutputLabel: {
    id: "AMvJKpre55",
    defaultMessage: "Translation output",
    description: "Label for how translated Drive files are named or placed",
  },
  prefix: {
    id: "Wsp7fFKzfm",
    defaultMessage: "Prefix with locale — [vi-VN] overview.docx",
    description: "Google Drive translation output option: locale prefix",
  },
  suffix: {
    id: "4gTVuYuFjY",
    defaultMessage: "Suffix with locale — overview [vi-VN].docx",
    description: "Google Drive translation output option: locale suffix",
  },
  underscore: {
    id: "+d/T9QKI1U",
    defaultMessage: "Underscore separator — overview_vi-VN.docx",
    description: "Google Drive translation output option: underscore locale",
  },
  folder: {
    id: "TWyi7AS4VO",
    defaultMessage: "Folder per language — vi-VN/overview.docx",
    description: "Google Drive translation output option: locale folder",
  },
  includeTranslatedFiles: {
    id: "GLMzG733Rw",
    defaultMessage: "Include existing translation output files (for example {example})",
    description: "Checkbox to import files already written as translation output",
  },
});
