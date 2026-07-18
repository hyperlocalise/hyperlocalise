"use client";

import { defineMessages } from "react-intl";

export const projectFilesErrorBoundaryMessages = defineMessages({
  treeFailed: {
    defaultMessage: "Files failed to load.",
    id: "DkpXUR9fM4",
    description: "Error title when the project files tree panel fails",
  },
  detailFailed: {
    defaultMessage: "File preview failed to load.",
    id: "C8yvKuxtRj",
    description: "Error title when the project file detail panel fails",
  },
  loadFailedFallback: {
    defaultMessage: "Failed to load files.",
    id: "wvvrX539Xf",
    description: "Fallback error message when a project files panel fails without details",
  },
  tryAgain: {
    defaultMessage: "Try again",
    id: "uEkaqKbwfV",
    description: "Button to retry loading a failed project files panel",
  },
});
