"use client";

import { defineMessages } from "react-intl";

export const jobQaFindingsModelMessages = defineMessages({
  unknownLocale: {
    defaultMessage: "Unknown locale",
    id: "A7MsbubEL0",
    description: "Group label when a QA finding has no locale",
  },
  commentPosted: {
    defaultMessage: "Comment posted",
    id: "iyeC0lBvav",
    description: "Write-back status when a provider comment was posted for a finding",
  },
  alreadyInTms: {
    defaultMessage: "Already in TMS",
    id: "x3PUnnOYom",
    description: "Write-back status when a finding already had a provider comment",
  },
  commentFailed: {
    defaultMessage: "Comment failed",
    id: "+FuW5t+7ZR",
    description: "Write-back status when posting a provider comment failed",
  },
});
