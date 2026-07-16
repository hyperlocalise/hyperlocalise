"use client";

import { defineMessages } from "react-intl";

export const automationsNewPageContentMessages = defineMessages({
  createFailed: {
    defaultMessage: "Failed to create automation",
    id: "v/lSaCxqUY",
    description: "Error when creating a workspace automation fails without an API message",
  },
  createSuccess: {
    defaultMessage: "Automation created",
    id: "7zni895OkR",
    description: "Toast when a new workspace automation is created successfully",
  },
  createError: {
    defaultMessage: "Unable to create automation right now",
    id: "sUjt/GKyKZ",
    description: "Toast when creating a workspace automation fails",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "X4qUUPKAse",
    description: "Button to cancel creating a new automation",
  },
  creating: {
    defaultMessage: "Creating...",
    id: "EavgCh3/dm",
    description: "Create button label while the automation create request is pending",
  },
  createAutomation: {
    defaultMessage: "Create automation",
    id: "45owmhJRGR",
    description: "Button to submit the new automation form",
  },
});
