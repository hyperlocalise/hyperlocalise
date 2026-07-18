"use client";

import { defineMessages } from "react-intl";

export const projectFileSourceStringsPreviewMessages = defineMessages({
  stringCount: {
    defaultMessage: "{count, plural, one {# string} other {# strings}}",
    id: "R8S6VU1Upj",
    description: "Count of source strings shown in the file preview",
  },
  stringCountTruncated: {
    defaultMessage: "{count, plural, one {# string} other {# strings}} (preview truncated)",
    id: "ggf5heOubM",
    description: "Count of source strings when the preview list is truncated",
  },
  keyColumn: {
    defaultMessage: "Key",
    id: "BkcBYxLJtW",
    description: "Column header for translation keys in the source strings preview table",
  },
  textColumn: {
    defaultMessage: "Text",
    id: "7wIRX6GiLH",
    description: "Column header for source text in the source strings preview table",
  },
  contextColumn: {
    defaultMessage: "Context",
    id: "F8EegdWpYQ",
    description: "Column header for string context in the source strings preview table",
  },
  emptyContext: {
    defaultMessage: "—",
    id: "Kua+B+Kq3s",
    description: "Placeholder shown when a source string has no context",
  },
});
