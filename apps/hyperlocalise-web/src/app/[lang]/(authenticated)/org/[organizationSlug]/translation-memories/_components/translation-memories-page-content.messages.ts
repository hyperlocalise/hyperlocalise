"use client";

import { defineMessages } from "react-intl";

export const translationMemoriesPageContentMessages = defineMessages({
  loadProjectsFailed: {
    defaultMessage: "Failed to load projects",
    id: "bWH4AOzvwJ",
    description: "Fallback error when projects fail to load on the translation memories page",
  },
  loadCredentialsFailed: {
    defaultMessage: "Failed to load provider credentials ({status})",
    id: "3BQQgDQPHy",
    description: "Error when TMS provider credentials fail to load",
  },
  loadProviderMemoriesFailed: {
    defaultMessage: "Failed to load provider translation memories ({status})",
    id: "ej+FsoZqXe",
    description: "Error when live provider translation memories fail to load",
  },
  loadMemoriesFailed: {
    defaultMessage: "Failed to load translation memories ({status})",
    id: "QIfhx7Pg8A",
    description: "Error when workspace translation memories fail to load",
  },
  createMemoryFailed: {
    defaultMessage: "Unable to create translation memory",
    id: "2AHzit242a",
    description: "Fallback error when creating a translation memory fails",
  },
  memoryCreated: {
    defaultMessage: "Translation memory created",
    id: "xZLc+H/X20",
    description: "Toast after a translation memory is created successfully",
  },
  nameRequired: {
    defaultMessage: "Translation memory name is required.",
    id: "p+mx30+l3M",
    description: "Validation error when the create translation memory name field is empty",
  },
});
