"use client";

import { defineMessages } from "react-intl";

export const contextMessages = defineMessages({
  modelContextUsageAria: {
    id: "ZvFzVdCf0G",

    defaultMessage: "Model context usage",
    description: "Accessible label for the circular model context usage indicator",
  },
  totalCost: {
    id: "5dpVYaBmRK",

    defaultMessage: "Total cost",
    description: "Label for total token usage cost in the context hover card footer",
  },
  input: {
    id: "uArB+a1gRA",

    defaultMessage: "Input",
    description: "Label for input token usage in the context hover card",
  },
  output: {
    id: "knOsYUbezF",

    defaultMessage: "Output",
    description: "Label for output token usage in the context hover card",
  },
  reasoning: {
    id: "a5wP5u9Iqr",

    defaultMessage: "Reasoning",
    description: "Label for reasoning token usage in the context hover card",
  },
  cache: {
    id: "5QymJ2ZjS2",

    defaultMessage: "Cache",
    description: "Label for cached input token usage in the context hover card",
  },
  usedOfTotal: {
    defaultMessage: "{used} / {total}",
    id: "8HqELsDVf0",
    description: "Context usage fraction showing tokens used out of the model context window",
  },
  tokensUnavailable: {
    defaultMessage: "—",
    id: "LDOufEL34i",
    description: "Placeholder shown when a token count is unavailable",
  },
  costSuffix: {
    defaultMessage: "• {cost}",
    id: "JmNB19hrDA",
    description: "Suffix showing estimated cost next to a token count",
  },
});
