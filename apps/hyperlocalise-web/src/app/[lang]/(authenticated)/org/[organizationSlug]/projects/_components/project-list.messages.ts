"use client";

import { defineMessages } from "react-intl";

export const projectListMessages = defineMessages({
  noDescription: {
    defaultMessage: "No description",
    id: "Onn6EwAIjq",
    description: "Fallback when a project list row has no description",
  },
  noTranslationContext: {
    defaultMessage: "No translation context",
    id: "/9wc0MhkMd",
    description: "Fallback when a project list row has no translation context",
  },
  createdUnavailable: {
    defaultMessage: "Created date unavailable",
    id: "iVNWaz9pgs",
    description: "Fallback when a project created date cannot be formatted",
  },
  updatedUnavailable: {
    defaultMessage: "Updated date unavailable",
    id: "XuLNOM8/60",
    description: "Fallback when a project updated date cannot be formatted",
  },
});
