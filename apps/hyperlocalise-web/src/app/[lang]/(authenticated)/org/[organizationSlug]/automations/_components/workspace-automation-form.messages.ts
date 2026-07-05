"use client";

import { defineMessages } from "react-intl";

export const workspaceAutomationFormMessages = defineMessages({
  scheduledTriggerHourly: {
    defaultMessage: "Every hour · {timezone}",
    id: "SlPmp40QPZ",
    description: "Summary for a scheduled automation that runs every hour",
  },
  scheduledTriggerDaily: {
    defaultMessage: "Every day at {time} · {timezone}",
    id: "TEXn81XSVY",
    description: "Summary for a scheduled automation that runs daily at a specific hour",
  },
  scheduledTriggerWeekly: {
    defaultMessage: "Every {weekday} at {time} · {timezone}",
    id: "8d4Iw9Q9DE",
    description: "Summary for a scheduled automation that runs weekly on a specific day and hour",
  },
});
