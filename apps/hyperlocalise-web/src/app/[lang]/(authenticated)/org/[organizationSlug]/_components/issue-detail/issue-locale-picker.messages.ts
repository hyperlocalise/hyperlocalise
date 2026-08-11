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

export const issueLocalePickerMessages = defineMessages({
  placeholder: {
    defaultMessage: "Select locale",
    id: "KYOkDtqOsb",
    description: "Placeholder for the issue locale picker",
  },
  anyLocale: {
    defaultMessage: "Any locale",
    id: "QOKexdLasq",
    description: "Option to clear the issue locale filter",
  },
  clearLocale: {
    defaultMessage: "No locale",
    id: "9jLtl6PUKI",
    description: "Option to clear the issue locale value",
  },
  emptyProjectLocales: {
    defaultMessage: "No project locales configured",
    id: "eTfP1zMvKR",
    description: "Shown when a project has no target locales for the picker",
  },
});
