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

export const localeDialogMessages = defineMessages({
  menuItem: {
    defaultMessage: "Language",
    id: "kwJnfdRB0A",
    description: "Account menu item that opens the language picker dialog",
  },
  title: {
    defaultMessage: "Choose your language",
    id: "xn4m8eZEq0",
    description: "Title of the language picker dialog",
  },
  description: {
    defaultMessage: "Hyperlocalise reloads in the language you pick.",
    id: "fHIwmwiNEw",
    description: "Helper text under the language picker dialog title",
  },
  searchPlaceholder: {
    defaultMessage: "Search languages or countries",
    id: "qqneuAa0kA",
    description: "Placeholder for the search input that filters the language picker",
  },
  searchAria: {
    defaultMessage: "Filter languages",
    id: "B9yaZ7jr+A",
    description: "Accessible label for the language picker search input",
  },
  noResults: {
    defaultMessage: "No languages match “{query}”.",
    id: "Rp/5QSbnYb",
    description: "Empty state when the language picker search has no matches",
  },
  currentLanguage: {
    defaultMessage: "Current language",
    id: "huDSdL+e9O",
    description: "Screen-reader hint on the language that is currently active",
  },
  regionAmericas: {
    defaultMessage: "Americas",
    id: "35WLjl7ktW",
    description: "Region heading in the language picker grid",
  },
  regionAsiaPacific: {
    defaultMessage: "Asia Pacific",
    id: "DJ0RTVgMIN",
    description: "Region heading in the language picker grid",
  },
  regionEurope: {
    defaultMessage: "Europe",
    id: "HylAKoKZ92",
    description: "Region heading in the language picker grid",
  },
});
