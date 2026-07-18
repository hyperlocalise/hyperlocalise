"use client";

import { defineMessages } from "react-intl";

export const projectFileSelectionActionsMessages = defineMessages({
  viewStrings: {
    defaultMessage: "View strings",
    id: "7WrG5oy0+1",
    description: "Button to open the selected project file in the CAT workspace",
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
    defaultMessage: "Open this file in the CAT workspace to review and edit translations.",
    id: "pzOrHk3KQa",
    description: "Helper text when the selected file can open in the CAT workspace",
  },
  catUnavailableHint: {
    defaultMessage: "The CAT workspace is not available for this file yet.",
    id: "yPsLdM5F3Q",
    description: "Helper text when the selected file cannot open in the CAT workspace",
  },
});
