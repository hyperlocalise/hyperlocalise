"use client";

import { defineMessages } from "react-intl";

export const dashboardPageContentMessages = defineMessages({
  featureUnavailable: {
    defaultMessage: "This feature is not available for your workspace yet.",
    id: "0GW7ilY3Dj",
    description: "Toast when a user is redirected because a workspace feature is unavailable",
  },
  liveTmsJobsWarning: {
    defaultMessage: "Live TMS jobs could not be loaded.",
    id: "UOrQi3aNyW",
    description: "Warning when live TMS assigned jobs fail but native jobs loaded",
  },
  nativeJobsWarning: {
    defaultMessage: "Native workspace jobs could not be loaded.",
    id: "+KUpBJ/DPe",
    description: "Warning when native assigned jobs fail but live TMS jobs loaded",
  },
});
