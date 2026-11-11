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

export const projectFileMessageFormatDialogMessages = defineMessages({
  title: {
    defaultMessage: "Placeholder format",
    id: "TWttJ3vuVB",
    description: "Dialog title for per-file placeholder (message format) settings",
  },
  description: {
    defaultMessage:
      "Choose the placeholder syntax used by this file. Translation checks compare placeholders between source and target using this syntax. Import and export are not affected.",
    id: "oWWUWUJy85",
    description: "Intro text for the per-file placeholder format dialog",
  },
  formatLabel: {
    defaultMessage: "Syntax",
    id: "tYBVGxIBlg",
    description: "Label for the placeholder syntax select",
  },
  formatAuto: {
    defaultMessage: "Auto-detect",
    id: "+qsnClk20i",
    description: "Placeholder syntax option that detects ICU and i18next placeholders",
  },
  formatIcu: {
    defaultMessage: "ICU MessageFormat",
    id: "I0ZnPk3SeC",
    description: "Placeholder syntax option for strict ICU MessageFormat",
  },
  formatI18next: {
    defaultMessage: "i18next",
    id: "fRpdPlIg3w",
    description: "Placeholder syntax option for i18next interpolation",
  },
  formatAutoHint: {
    defaultMessage:
      "Checks ICU arguments, plurals, and selects, plus double-brace interpolations used by i18next and Mustache.",
    id: "d8y6MaSCHF",
    description: "Explanation of the auto-detect placeholder syntax",
  },
  formatIcuHint: {
    defaultMessage:
      "Checks ICU arguments, plurals, and selects only. Double braces and nesting such as $t(key) are treated as plain text.",
    id: "LSlfg5k13a",
    description: "Explanation of the strict ICU placeholder syntax",
  },
  formatI18nextHint: {
    defaultMessage:
      "Checks double-brace interpolations and nesting only. Single braces are treated as plain text and ICU plurals are not parsed.",
    id: "FNVuLRr9pO",
    description: "Explanation of the i18next placeholder syntax",
  },
  patternsLabel: {
    defaultMessage: "Custom placeholder patterns",
    id: "8MUhdYT135",
    description: "Label for the per-file custom placeholder regular expressions field",
  },
  patternsPlaceholder: {
    defaultMessage: "\\[\\[\\w+\\]\\]",
    id: "XgwWkCr4oC",
    description:
      "Example regular expression shown in the empty custom placeholder patterns field; matches [[name]]",
  },
  patternsHint: {
    defaultMessage:
      "One regular expression per line, up to {max}. Text that matches is treated as a placeholder, in addition to the syntax above. Lookaround and backreferences are not supported.",
    id: "XD+bIMwUyH",
    description: "Help text under the custom placeholder patterns field",
  },
  patternErrorInvalid: {
    defaultMessage: "Line {line} is not a valid regular expression.",
    id: "jhaXEyezy6",
    description: "Validation error for an invalid custom placeholder pattern",
  },
  patternErrorTooLong: {
    defaultMessage: "Line {line} is longer than {max} characters.",
    id: "Z73RWKPiOM",
    description: "Validation error for a custom placeholder pattern that is too long",
  },
  patternErrorUnsupported: {
    defaultMessage: "Line {line} uses lookaround or a backreference, which is not supported.",
    id: "p4EP3lBEdG",
    description: "Validation error for a custom placeholder pattern that uses unsupported syntax",
  },
  patternErrorMatchesEmpty: {
    defaultMessage: "Line {line} matches empty text. Make it match at least one character.",
    id: "qjQww08Liu",
    description: "Validation error for a custom placeholder pattern that can match an empty string",
  },
  patternErrorTooMany: {
    defaultMessage: "Use at most {max} patterns.",
    id: "qjLg/sUBaB",
    description: "Validation error when too many custom placeholder patterns are entered",
  },
  sampleLabel: {
    defaultMessage: "Test your patterns",
    id: "ck1HBQc2GC",
    description: "Label for a sample text field that previews custom placeholder matches",
  },
  samplePlaceholder: {
    defaultMessage: "Paste a source string",
    id: "Tkf+LdCpRA",
    description: "Placeholder text for the custom placeholder sample field",
  },
  sampleMatches: {
    defaultMessage: "{count, plural, one {# placeholder} other {# placeholders}}: {matches}",
    id: "9klX4rpx6h",
    description: "Lists the custom placeholders found in the sample text",
  },
  sampleNoMatches: {
    defaultMessage: "No placeholders match.",
    id: "P+ULCdr4tE",
    description: "Shown when no custom placeholder pattern matches the sample text",
  },
  loadFailed: {
    defaultMessage: "Could not load placeholder format.",
    id: "iaUn+Dn3Pk",
    description: "Error when loading per-file placeholder format fails",
  },
  retry: {
    defaultMessage: "Try again",
    id: "rlF044R+WV",
    description: "Retry button after placeholder format failed to load",
  },
  saveFailed: {
    defaultMessage: "Could not save placeholder format.",
    id: "LFyUVsCgBE",
    description: "Error when saving per-file placeholder format fails",
  },
  saveSuccess: {
    defaultMessage: "Placeholder format saved.",
    id: "ecdy8QZiYq",
    description: "Toast after saving per-file placeholder format",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "gNwdZXjHEr",
    description: "Cancel button in the placeholder format dialog",
  },
  save: {
    defaultMessage: "Save",
    id: "apPctURphV",
    description: "Save button in the placeholder format dialog",
  },
});
