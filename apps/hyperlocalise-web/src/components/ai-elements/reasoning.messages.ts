"use client";

import { defineMessages } from "react-intl";

export const reasoningMessages = defineMessages({
  thinking: {
    id: "7SvzEySkCN",

    defaultMessage: "Thinking...",
    description: "Label shown while the model is actively reasoning",
  },
  thoughtFewSeconds: {
    id: "IW+967m+1e",

    defaultMessage: "Thought for a few seconds",
    description: "Label when reasoning completed without a measured duration",
  },
  thoughtDuration: {
    id: "gQ9rDnH0hp",

    defaultMessage: "Thought for {duration} seconds",
    description: "Label showing how long the model spent reasoning",
  },
});
