"use client";

import { defineMessages } from "react-intl";

export const projectFileCatApiMessages = defineMessages({
  failedToLoadQueue: {
    defaultMessage: "Failed to load CAT queue",
    id: "lE4XkWZPD6",
    description: "Fallback error when the project file CAT queue request fails",
  },
  failedToLoadSegmentComments: {
    defaultMessage: "Failed to load segment comments",
    id: "v6QIe3eb5N",
    description: "Fallback error when loading CAT segment comments fails",
  },
  failedToLoadSegmentTranslation: {
    defaultMessage: "Failed to load segment translation",
    id: "4MUAkFDjce",
    description: "Fallback error when loading a CAT segment target translation fails",
  },
});
