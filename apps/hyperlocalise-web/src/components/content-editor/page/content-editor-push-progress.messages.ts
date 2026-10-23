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

export const contentEditorPushProgressMessages = defineMessages({
  translationPercent: {
    defaultMessage: "{percent}%",
    id: "TavFARAoYK",
    description: "Translated percent shown on a Content editor push dialog row",
  },
  approvalPercent: {
    defaultMessage: "{percent}%",
    id: "qMcssRo5Ql",
    description: "Approved percent shown on a Content editor push dialog row",
  },
  progressLabel: {
    defaultMessage: "Translated {translated}% · Approved {approved}%",
    id: "fcLi/NB58Y",
    description: "Accessible label for translated and approved percentages on a push dialog row",
  },
  progressBarLabel: {
    defaultMessage: "{locale}: Translated {translated}% · Approved {approved}%",
    id: "U4sr4IyxSs",
    description: "Accessible label for a locale progress bar in a Content editor push dialog",
  },
  approveHint: {
    defaultMessage:
      "Only approved translations are pushed. Approve translated strings in the Content editor first.",
    id: "DND9HC6iiD",
    description: "Hint in a Content editor push dialog that translations must be approved first",
  },
  refresh: {
    defaultMessage: "Refresh",
    id: "OiwlgVlbmX",
    description: "Reload mapped items and locale progress in a Content editor push dialog",
  },
  ineligibleSelectionError: {
    defaultMessage:
      "Some selected items have no locales ready to push. Deselect them or approve translations first.",
    id: "s5fbO82G4x",
    description: "Toast when a Content editor push confirm includes items with nothing to push",
  },
});
