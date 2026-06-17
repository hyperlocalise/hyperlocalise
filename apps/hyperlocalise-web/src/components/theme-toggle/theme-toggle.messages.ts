"use client";

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
