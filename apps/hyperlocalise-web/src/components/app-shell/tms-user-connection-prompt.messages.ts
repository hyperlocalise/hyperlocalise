"use client";

import { defineMessages } from "react-intl";

export const tmsUserConnectionPromptMessages = defineMessages({
  connectionRequired: {
    defaultMessage: "Connect {provider} to view provider {resource}.",
    id: "Bfwle3X1Yy",
    description:
      "Error heading when TMS provider data cannot load because the user has not connected their account",
  },
  loadFailed: {
    defaultMessage: "Failed to load provider data.",
    id: "LURuzj5+No",
    description: "Generic error heading when TMS provider data fails to load",
  },
});
