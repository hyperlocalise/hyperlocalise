"use client";

import { defineMessages } from "react-intl";

export const issueDetailPageContentMessages = defineMessages({
  loadingAria: {
    defaultMessage: "Loading issue",
    id: "IKxY25Mtmd",
    description: "Accessible label while the full-page issue detail loads",
  },
  notFound: {
    defaultMessage: "Issue not found or you do not have access.",
    id: "QCQEKXAzmZ",
    description: "Shown when the issue detail page cannot load the issue",
  },
});
