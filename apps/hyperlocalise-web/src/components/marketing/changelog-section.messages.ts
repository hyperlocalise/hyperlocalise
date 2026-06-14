"use client";

import { defineMessages } from "react-intl";

export const changelogSectionMessages = defineMessages({
  eyebrow: {
    defaultMessage: "Recent releases",
    id: "QnnwAgLg8n",
    description: "Eyebrow label above the marketing homepage changelog heading",
  },
  heading: {
    defaultMessage: "Changelog",
    id: "fXvloFU8Gq",
    description: "Marketing homepage changelog section title",
  },
  description: {
    defaultMessage:
      "Product updates that tighten release confidence, reduce localization drift, and make sync runs easier to trust.",
    id: "vIOlX9aQCn",
    description: "Supporting copy below the marketing homepage changelog heading",
  },
  latestBadge: {
    defaultMessage: "Latest",
    id: "QtiWxX0wMy",
    description: "Badge on the most recent changelog entry",
  },
  releaseBadge: {
    defaultMessage: "Release",
    id: "L/HgO7C2N8",
    description: "Badge on older changelog entries",
  },
  readRelease: {
    defaultMessage: "Read release",
    id: "A/3tn9sI6t",
    description: "Link to open a changelog entry on GitHub",
  },
});

export const changelogEntryMessages = defineMessages({
  v1813Title: {
    defaultMessage: "v1.8.13",
    id: "/zFX1es8ng",
    description: "Changelog entry version label",
  },
  v1813Body: {
    defaultMessage:
      "Hardened Crowdin CAT workflows with approved translations, richer segment context, repository lookup fixes, and ICU parser improvements.",
    id: "RZnlh4sL3E",
    description: "Changelog summary for v1.8.13",
  },
  v1813Meta: {
    defaultMessage: "Jun 11, 2026",
    id: "wJyzKNtNdN",
    description: "Release date for v1.8.13",
  },
  v1812Title: {
    defaultMessage: "v1.8.12",
    id: "LQX+WwcLPZ",
    description: "Changelog entry version label",
  },
  v1812Body: {
    defaultMessage:
      "Launched the next-gen CAT workspace with Storybook coverage, added teams UI for member assignment, and optimized XML parsing hot paths.",
    id: "lKEGCW8O9K",
    description: "Changelog summary for v1.8.12",
  },
  v1812Meta: {
    defaultMessage: "Jun 8, 2026",
    id: "NdByfSdiiG",
    description: "Release date for v1.8.12",
  },
  v1811Title: {
    defaultMessage: "v1.8.11",
    id: "veMOhGUUo8",
    description: "Changelog entry version label",
  },
  v1811Body: {
    defaultMessage:
      "Added multi-intent Slack agent routing so localization requests are classified and routed to the right workflow automatically.",
    id: "uMhqkS/Mjl",
    description: "Changelog summary for v1.8.11",
  },
  v1811Meta: {
    defaultMessage: "Jun 2, 2026",
    id: "GA9EUye9Vi",
    description: "Release date for v1.8.11",
  },
  v1810Title: {
    defaultMessage: "v1.8.10",
    id: "y1v1JtVpgC",
    description: "Changelog entry version label",
  },
  v1810Body: {
    defaultMessage:
      "Optimized XLIFF parsing and marshaling for faster sync runs on large translation files.",
    id: "hj0uanNy1V",
    description: "Changelog summary for v1.8.10",
  },
  v1810Meta: {
    defaultMessage: "Jun 1, 2026",
    id: "WbNr/i41I1",
    description: "Release date for v1.8.10",
  },
});
