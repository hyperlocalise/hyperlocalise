"use client";

import { defineMessages } from "react-intl";

export const testResultsMessages = defineMessages({
  passedCount: {
    id: "FlwYDfCvTq",

    defaultMessage: "{count} passed",
    description: "Badge label for the number of passed tests",
  },
  failedCount: {
    id: "rQXpyeuWHx",

    defaultMessage: "{count} failed",
    description: "Badge label for the number of failed tests",
  },
  skippedCount: {
    id: "9gxIcCZ7b1",

    defaultMessage: "{count} skipped",
    description: "Badge label for the number of skipped tests",
  },
  testsPassedProgress: {
    id: "+t9Xh+JbAF",

    defaultMessage: "{passed}/{total} tests passed",
    description: "Progress summary showing passed tests out of total",
  },
});
