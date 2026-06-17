"use client";

import { defineMessages } from "react-intl";

export const webPreviewMessages = defineMessages({
  urlPlaceholder: {
    id: "iZaQ7K2itB",

    defaultMessage: "Enter URL...",
    description: "Placeholder for the web preview URL input",
  },
  previewTitle: {
    id: "usgyWI2m6M",

    defaultMessage: "Preview",
    description: "Title attribute for the web preview iframe",
  },
  console: {
    id: "tj9LSxTmXM",

    defaultMessage: "Console",
    description: "Label for the web preview console collapsible section",
  },
  noConsoleOutput: {
    id: "P7DyqhOghg",

    defaultMessage: "No console output",
    description: "Empty state when the web preview console has no logs",
  },
});
