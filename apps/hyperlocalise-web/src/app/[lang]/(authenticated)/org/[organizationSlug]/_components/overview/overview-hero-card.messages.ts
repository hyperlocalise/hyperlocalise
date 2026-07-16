"use client";

import { defineMessages } from "react-intl";

export const overviewHeroCardMessages = defineMessages({
  allCaughtUp: {
    defaultMessage: "All caught up",
    id: "CDHpNJeAfK",
    description: "Overview hero badge when there are no pending actions",
  },
  pendingActions: {
    defaultMessage: "{count, plural, one {# pending action} other {# pending actions}}",
    id: "CzEPtyNc5S",
    description: "Overview hero badge showing how many pending actions remain",
  },
});
