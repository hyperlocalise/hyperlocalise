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

export const tmEntryLocaleFieldMessages = defineMessages({
  useCustomLocale: {
    defaultMessage: "Use a custom locale",
    id: "tmEntryLocaleUseCustom",
    description: "Button that reveals a custom BCP-47 locale input",
  },
  customLocalePlaceholder: {
    defaultMessage: "e.g. sw-KE",
    id: "tmEntryLocaleCustomPlaceholder",
    description: "Placeholder for a custom BCP-47 locale tag",
  },
  applyCustomLocale: {
    defaultMessage: "Use locale",
    id: "tmEntryLocaleApplyCustom",
    description: "Button that applies a custom BCP-47 locale",
  },
  invalidCustomLocale: {
    defaultMessage: "Enter a valid BCP-47 locale (e.g. fr-FR, zh-Hant-TW).",
    id: "tmEntryLocaleInvalidCustom",
    description: "Validation error for an invalid custom translation memory locale",
  },
});
