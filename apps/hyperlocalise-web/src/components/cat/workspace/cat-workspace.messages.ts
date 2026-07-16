"use client";

import { defineMessages } from "react-intl";

export const catWorkspaceViewMessages = defineMessages({
  segmentPosition: {
    defaultMessage: "{position} / {total}",
    id: "8UnBVLcjgq",
    description: "Current segment index and total count in the compact CAT workspace header",
  },
  segmentPositionOpenEnded: {
    defaultMessage: "{position}+",
    id: "0x11s5ha3b",
    description: "Current segment index when more queue pages may exist and total count is unknown",
  },
});
