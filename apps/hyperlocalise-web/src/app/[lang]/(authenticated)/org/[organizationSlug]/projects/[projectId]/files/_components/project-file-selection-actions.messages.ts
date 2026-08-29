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

export const projectFileSelectionActionsMessages = defineMessages({
  openEditor: {
    defaultMessage: "Open Editor",
    id: "Wbm7kwzdGk",
    description: "Button to open the selected project file in the Content Editor",
  },
  translateWithAgent: {
    defaultMessage: "Translate with agent",
    id: "gwTzpfT+Nl",
    description: "Button to open the translate-with-agent dialog for a project file",
  },
  importTranslations: {
    defaultMessage: "Import translations",
    id: "Vwd7ezOYM5",
    description: "Button to open the import translations dialog for a project file",
  },
  download: {
    defaultMessage: "Download",
    id: "3R2FH9E6p2",
    description: "Button to open the download translations dialog for a project file",
  },
  catAvailableHint: {
    defaultMessage: "Open this file in the Content Editor to review and edit translations.",
    id: "EH1mWPBRDl",
    description: "Helper text when the selected file can open in the Content Editor",
  },
  catUnavailableHint: {
    defaultMessage: "The Content Editor is not available for this file yet.",
    id: "nBYmE0FBb3",
    description: "Helper text when the selected file cannot open in the Content Editor",
  },
});
