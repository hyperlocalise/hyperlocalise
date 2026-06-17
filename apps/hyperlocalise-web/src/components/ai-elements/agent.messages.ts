"use client";

import { defineMessages } from "react-intl";

export const agentMessages = defineMessages({
  instructions: {
    id: "mltE2S4MiK",

    defaultMessage: "Instructions",
    description: "Section label for agent system instructions",
  },
  tools: {
    id: "5atqmuSxdx",

    defaultMessage: "Tools",
    description: "Section label for agent tools list",
  },
  noDescription: {
    id: "hCvBHiYeFU",

    defaultMessage: "No description",
    description: "Fallback when an agent tool has no description",
  },
  outputSchema: {
    id: "1zjzxzctS5",

    defaultMessage: "Output Schema",
    description: "Section label for agent output schema",
  },
});
