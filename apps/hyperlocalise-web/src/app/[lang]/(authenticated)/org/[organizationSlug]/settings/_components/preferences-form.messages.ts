"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const preferencesFormMessages = defineMessages({
  appearanceTitle: {
    defaultMessage: "Appearance",
    id: "Gpt3eQvF89",
    description: "Section heading for color theme on preferences",
  },
  appearanceDescription: {
    defaultMessage: "Choose a color theme for Hyperlocalise. System follows this device.",
    id: "9tw7nkErCF",
    description: "Helper text under appearance on preferences",
  },
  languageTitle: {
    defaultMessage: "Language",
    id: "YAYH7gCMxP",
    description: "Section heading for UI language on preferences",
  },
  languageDescription: {
    defaultMessage: "Hyperlocalise reloads in the language you pick.",
    id: "dyjW5dGOVQ",
    description: "Helper text under language on preferences",
  },
  timezoneTitle: {
    defaultMessage: "Timezone",
    id: "GHpJcQfhW9",
    description: "Section heading for timezone on preferences",
  },
  timezoneDescription: {
    defaultMessage: "Personal timestamps use this zone. Reports stay on UTC.",
    id: "z83RQwdIIP",
    description: "Helper text under timezone on preferences",
  },
  timezoneLabel: {
    defaultMessage: "Timezone",
    id: "ONnLS/lh3w",
    description: "Accessible label for the timezone combobox",
  },
  timezoneSearch: {
    defaultMessage: "Search timezones",
    id: "Ut3XsOJLWe",
    description: "Placeholder for the timezone search input",
  },
  timezoneEmpty: {
    defaultMessage: "No matching timezones",
    id: "l9FFmk0ReX",
    description: "Empty state when timezone search matches nothing",
  },
  clockTitle: {
    defaultMessage: "Time format",
    id: "zv92q3x9oQ",
    description: "Section heading for 12/24-hour clock on preferences",
  },
  clockDescription: {
    defaultMessage: "How times appear in activity, jobs, and files.",
    id: "R5Rwhb+/lj",
    description: "Helper text under time format on preferences",
  },
  clockLabel: {
    defaultMessage: "Time format",
    id: "wZdtxizdxL",
    description: "Accessible label for the 12/24-hour select",
  },
  clock12: {
    defaultMessage: "12-hour",
    id: "jlI+vPipSu",
    description: "12-hour clock option",
  },
  clock24: {
    defaultMessage: "24-hour",
    id: "/u7ee53S5p",
    description: "24-hour clock option",
  },
  preview: {
    defaultMessage: "Now: {sample}",
    id: "V7Cnf89/eC",
    description: "Live preview of the current time in the selected timezone and clock",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "R57BrBtQO4",
    description: "Status text while appearance preferences are saving",
  },
  loadError: {
    defaultMessage: "Could not load preferences.",
    id: "DgWiUVAIXE",
    description: "Error when appearance preferences fail to load",
  },
});
