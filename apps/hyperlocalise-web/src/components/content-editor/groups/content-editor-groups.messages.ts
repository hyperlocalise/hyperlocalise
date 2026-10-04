"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const groupMessages = defineMessages({
  view: {
    id: "AMsokTw7BJ",
    defaultMessage: "String view",
    description: "Editor string grouping view label",
  },
  individual: {
    id: "MWGQAGG98v",
    defaultMessage: "Individual strings",
    description: "Individual string view option",
  },
  grouped: {
    id: "6r2HnqYZDl",
    defaultMessage: "Group identical strings",
    description: "Grouped string view option",
  },
  projectDefault: {
    id: "SJA7gyKsZV",
    defaultMessage: "Use project default",
    description: "Reset personal grouping preference",
  },
  occurrences: {
    id: "tty9Qguyd5",
    defaultMessage: "{count, plural, one {# occurrence} other {# occurrences}}",
    description: "Number of identical source occurrences",
  },
  occurrenceBadge: {
    id: "UjdToCr2vA",
    defaultMessage: "×{count}",
    description: "Compact badge for how many identical strings a grouped queue row saves to",
  },
  variantsHeading: {
    id: "Lr7AuUbkuo",
    defaultMessage: "{count, plural, one {# translation} other {# different translations}}",
    description: "Heading when identical source strings have different translations",
  },
  variantsHint: {
    id: "rHxmEAsvVD",
    defaultMessage:
      "Saving a translation updates only the strings that share it. Use Apply to all to make every occurrence match.",
    description: "Explains how saving a translation variant works",
  },
  untranslated: {
    id: "Ye4i9DEFBz",
    defaultMessage: "Untranslated",
    description: "Variant whose occurrences have no translation yet",
  },
  approved: {
    id: "63x7baaw0h",
    defaultMessage: "Approved",
    description: "Badge on a translation variant whose occurrences are all approved",
  },
  locked: {
    id: "P54Wzfa5O5",
    defaultMessage: "Locked",
    description: "Locked member badge",
  },
  moreOccurrences: {
    id: "b6Y2i7W7pE",
    defaultMessage: "+{count} more",
    description: "More occurrence keys not listed on a translation variant",
  },
  placeholder: {
    id: "dz3Vg2TBp6",
    defaultMessage: "Enter translation",
    description: "Placeholder for a translation variant input",
  },
  saveDraft: {
    id: "ruYH2S5Zlk",
    defaultMessage: "Save",
    description: "Save a translation variant as a draft",
  },
  approve: {
    id: "b21BDbV3Fd",
    defaultMessage: "Approve",
    description: "Save and approve a translation variant",
  },
  applyToAll: {
    id: "CQ6ZozSvfA",
    defaultMessage: "Apply to all",
    description: "Save this translation to every occurrence of the identical source string",
  },
  saveFailed: {
    id: "uC9uH1Yi+P",
    defaultMessage: "Could not save the translation.",
    description: "Error when saving a translation variant fails",
  },
  loadFailed: {
    id: "P0Zfg6wWEm",
    defaultMessage: "Could not load translations for identical strings.",
    description: "Error when translation variants cannot be loaded",
  },
  retry: {
    id: "VQnDEkq3vd",
    defaultMessage: "Retry",
    description: "Retry loading translation variants",
  },
  differentTranslations: {
    id: "GRO2ZA5iZP",
    defaultMessage: "Different translations",
    description: "Badge on a grouped row whose identical strings have different translations",
  },
  occurrencesDivergent: {
    id: "VP21W4YIkX",
    defaultMessage:
      "{count, plural, one {# occurrence} other {# occurrences}} with different translations",
    description: "Tooltip on the occurrence badge of a grouped row whose copies disagree",
  },
  divergentSaveBlocked: {
    id: "A+0t4PwPV3",
    defaultMessage:
      "These identical strings have different translations. Save each translation separately or use Apply to all.",
    description: "Error when saving a single translation for a grouped row whose copies disagree",
  },
});
