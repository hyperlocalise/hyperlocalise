"use client";

import { defineMessages } from "react-intl";

export const jobsPageContentMessages = defineMessages({
  createJob: {
    defaultMessage: "Create job",
    id: "+imNjDj2UT",
    description: "Button to open the create job dialog from the jobs page",
  },
  loadJobsFailed: {
    defaultMessage: "Failed to load jobs",
    id: "tuH9VcQWRE",
    description: "Fallback error when native jobs fail to load",
  },
  loadTmsJobsFailed: {
    defaultMessage: "Failed to load TMS jobs",
    id: "PhiMU1WefX",
    description: "Fallback error when TMS jobs fail to load",
  },
});
