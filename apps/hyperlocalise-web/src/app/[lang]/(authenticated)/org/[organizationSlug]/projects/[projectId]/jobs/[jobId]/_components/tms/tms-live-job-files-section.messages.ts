"use client";

import { defineMessages } from "react-intl";

export const tmsLiveJobFilesSectionMessages = defineMessages({
  failedToLoadTaskFiles: {
    defaultMessage: "Failed to load task files ({status})",
    id: "BnlCirDHql",
    description: "Error when the live TMS job files request fails",
  },
  unableToLoadTaskFiles: {
    defaultMessage: "Unable to load task files",
    id: "L80pAvj6yJ",
    description: "Fallback error when task files fail to load without an Error message",
  },
  noFilesLinked: {
    defaultMessage: "No files are linked to this task.",
    id: "bHnFWGWqed",
    description: "Empty state when a live TMS job has no linked files",
  },
});
