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

export const multilingualMessages = defineMessages({
  title: {
    defaultMessage: "Multilingual translations",
    id: "fmtkoir6Cw",
    description: "Multilingual table title label",
  },
  languages: {
    defaultMessage: "Languages",
    id: "3QmQFMO6jX",
    description: "Multilingual table languages label",
  },
  key: {
    defaultMessage: "Key",
    id: "BnVSqljQov",
    description: "Multilingual table key label",
  },
  source: {
    defaultMessage: "{language} (source)",
    id: "1A3oOwAeXf",
    description: "Multilingual table source label",
  },
  missing: {
    defaultMessage: "Not translated",
    id: "CuNKMtOPln",
    description: "Multilingual table missing label",
  },
  retry: {
    defaultMessage: "Retry",
    id: "B7HJpY5IHI",
    description: "Multilingual table retry label",
  },
  failed: {
    defaultMessage: "Could not load translation",
    id: "2Hftj6qZP3",
    description: "Multilingual table failed label",
  },
  loading: {
    defaultMessage: "Loading translations\u2026",
    id: "oD9uIlyEmh",
    description: "Multilingual table loading label",
  },
  more: {
    defaultMessage: "Load more keys",
    id: "6hO1kU+HPL",
    description: "Multilingual table more label",
  },
  empty: {
    defaultMessage: "No keys match the current filters.",
    id: "U9JGBvqNdg",
    description: "Multilingual table empty label",
  },
  open: {
    defaultMessage: "Edit {key} in {language}",
    id: "z7zgiC7+v3",
    description: "Multilingual table open label",
  },
  sourceTag: {
    defaultMessage: "Source",
    id: "8f+Z7j++lV",
    description: "Tag next to the source locale in the multilingual table header",
  },
  localeProgress: {
    defaultMessage: "{translated} translated, {approved} approved across the project",
    id: "f2FwokIl/H",
    description:
      "Tooltip and accessible label for a locale's project progress bar in the multilingual table header",
  },
  highlight: {
    defaultMessage: "Highlight",
    id: "VnvSMOC7bu",
    description: "Accessible label for the multilingual table highlight controls",
  },
  highlightAll: {
    defaultMessage: "All",
    id: "jOYcD1Iki8",
    description: "Multilingual table highlight option that shows every cell normally",
  },
  highlightMissing: {
    defaultMessage: "Missing",
    id: "ePnFZKBU1V",
    description: "Multilingual table highlight option for cells without a translation",
  },
  highlightNeedsReview: {
    defaultMessage: "Needs review",
    id: "lYH/c2rk1D",
    description: "Multilingual table highlight option for translations waiting for review",
  },
  highlightVariants: {
    defaultMessage: "Variants",
    id: "PrrCu0ecSd",
    description:
      "Multilingual table highlight option for grouped strings with different translations",
  },
  density: {
    defaultMessage: "Row density",
    id: "M9Kzr2KsRw",
    description: "Accessible label for the multilingual table row density controls",
  },
  densityComfortable: {
    defaultMessage: "Comfortable rows",
    id: "IaahpXZek4",
    description: "Multilingual table row density option with more spacing",
  },
  densityCompact: {
    defaultMessage: "Compact rows",
    id: "Ut76PXj5Bp",
    description: "Multilingual table row density option with less spacing",
  },
  shortcuts: {
    defaultMessage: "Shortcuts and legend",
    id: "63AxJv687c",
    description:
      "Button label that opens the multilingual table keyboard shortcuts and status legend",
  },
  shortcutsTitle: {
    defaultMessage: "Keyboard shortcuts",
    id: "p4BlLNpbhi",
    description: "Heading for the keyboard shortcuts in the multilingual table help popover",
  },
  shortcutEdit: {
    defaultMessage: "Edit a translation",
    id: "sxXlObphWF",
    description: "Multilingual table shortcut: clicking a cell edits it",
  },
  shortcutEditKey: {
    defaultMessage: "Click",
    id: "CzXbpX9Wfl",
    description: "Key label for the multilingual table edit shortcut",
  },
  shortcutDown: {
    defaultMessage: "Save and move down",
    id: "rEhy+CeUvT",
    description: "Multilingual table shortcut: Enter saves and moves to the row below",
  },
  shortcutAcross: {
    defaultMessage: "Save and move across",
    id: "KMLGXJn67q",
    description: "Multilingual table shortcut: Tab saves and moves to the next language",
  },
  shortcutNewLine: {
    defaultMessage: "Add a line",
    id: "qkCin2ogab",
    description: "Multilingual table shortcut: Shift+Enter inserts a line break",
  },
  shortcutCancel: {
    defaultMessage: "Cancel",
    id: "9RTjpQWqfc",
    description: "Multilingual table shortcut: Escape discards the edit",
  },
  legendTitle: {
    defaultMessage: "Status",
    id: "4jKejftvw6",
    description: "Heading for the status colour legend in the multilingual table help popover",
  },
  statusNeedsReview: {
    defaultMessage: "Needs review",
    id: "MD3nwHbObk",
    description: "Multilingual table status for a translation waiting for review",
  },
  statusDraft: {
    defaultMessage: "Draft",
    id: "XREzwTw5rY",
    description: "Multilingual table status for a draft translation",
  },
  statusRejected: {
    defaultMessage: "Rejected",
    id: "ghYkxOtbrK",
    description: "Multilingual table status for a rejected translation",
  },
  statusUnsaved: {
    defaultMessage: "Unsaved",
    id: "QAs8k3PHCq",
    description: "Multilingual table status for a cell with an edit that is not saved yet",
  },
  count: {
    defaultMessage: "{count, number} keys loaded",
    id: "F0KK3Ot1t7",
    description: "Multilingual table count label",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "oNLP4frHL4",
    description: "Inline translation save status",
  },
  approved: {
    defaultMessage: "Approved",
    id: "FxqkXT7ENB",
    description: "Multilingual table approved label",
  },
});
