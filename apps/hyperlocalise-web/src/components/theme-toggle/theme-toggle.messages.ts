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

export const themeToggleMessages = defineMessages({
  changeTheme: {
    defaultMessage: "Change theme",
    id: "bkfXJLTZg0",
    description: "Accessible label and tooltip for the color theme toggle button",
  },
  colorThemeAria: {
    defaultMessage: "Color theme",
    id: "DEaqfo0mck",
    description: "Accessible label for the theme selection radio group",
  },
  light: {
    defaultMessage: "Light",
    id: "wZj9YtEHDA",
    description: "Light color theme option in the theme toggle menu",
  },
  dark: {
    defaultMessage: "Dark",
    id: "SI44gUPbhn",
    description: "Dark color theme option in the theme toggle menu",
  },
  system: {
    defaultMessage: "System",
    id: "5CjwrQGWSz",
    description: "System color theme option that follows the OS preference",
  },
});
