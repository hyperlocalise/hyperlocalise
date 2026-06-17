"use client";

import { defineMessages } from "react-intl";

export const environmentVariablesMessages = defineMessages({
  title: {
    id: "/nzPUPTay3",

    defaultMessage: "Environment Variables",
    description: "Section title for environment variables panel",
  },
  toggleVisibilityAria: {
    id: "0Yq9F0iaq9",

    defaultMessage: "Toggle value visibility",
    description: "Accessible label for showing or hiding secret environment variable values",
  },
  copied: {
    id: "RsZZrwZXV+",

    defaultMessage: "Copied!",
    description: "Tooltip after an environment variable value is copied",
  },
  copyValue: {
    id: "IarSQrZ6vP",

    defaultMessage: "Copy value",
    description: "Tooltip for copying an environment variable value",
  },
  copyName: {
    id: "vfXyrNNj+X",

    defaultMessage: "Copy name",
    description: "Tooltip for copying an environment variable name",
  },
  copyExportCommand: {
    id: "XEC4R2CUep",

    defaultMessage: "Copy export command",
    description: "Tooltip for copying a shell export command for an environment variable",
  },
  required: {
    id: "gyGnNuR5md",

    defaultMessage: "Required",
    description: "Badge label for a required environment variable",
  },
});
