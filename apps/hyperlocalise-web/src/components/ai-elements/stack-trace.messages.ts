"use client";

import { defineMessages } from "react-intl";

export const stackTraceMessages = defineMessages({
  copied: {
    id: "77onpKogma",

    defaultMessage: "Copied!",
    description: "Tooltip after stack trace is copied to the clipboard",
  },
  copyStackTrace: {
    id: "jEwAQCIVg4",

    defaultMessage: "Copy stack trace",
    description: "Tooltip and aria label for copying a stack trace",
  },
  noStackFrames: {
    id: "cKb/sPVSsm",

    defaultMessage: "No stack frames",
    description: "Empty state when a stack trace has no frames to display",
  },
});
