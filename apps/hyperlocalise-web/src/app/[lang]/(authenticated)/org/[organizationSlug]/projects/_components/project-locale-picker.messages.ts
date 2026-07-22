"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const projectLocalePickerMessages = defineMessages({
  sourceLocaleLabel: {
    defaultMessage: "Source locale",
    id: "UZWbgJ+bye",
    description: "Label for the project source locale picker",
  },
  selectLocalePlaceholder: {
    defaultMessage: "Select locale",
    id: "v9kMcegF3r",
    description: "Placeholder for the source locale select",
  },
  targetLocalesLabel: {
    defaultMessage: "Target locales",
    id: "vv8/iiR38E",
    description: "Label for the project target locales picker",
  },
  invalidCustomLocale: {
    defaultMessage: "Enter a valid BCP-47 locale (e.g. fr-FR, zh-Hant-TW).",
    id: "hElFzW5+gy",
    description: "Validation error for an invalid custom target locale",
  },
  targetMatchesSource: {
    defaultMessage: "Target locale cannot match the source locale.",
    id: "e2GH/61cB8",
    description: "Validation error when a target locale matches the source locale",
  },
  otherTargetLocalePlaceholder: {
    defaultMessage: "Other target locale",
    id: "bgBgMVkDdH",
    description: "Placeholder for adding a custom target locale",
  },
  add: {
    defaultMessage: "Add",
    id: "vytBTgUTFc",
    description: "Button to add a custom target locale",
  },
  addOtherTargetLocale: {
    defaultMessage: "Add other target locale",
    id: "xePdJUPla7",
    description: "Accessible label for the button that reveals the custom locale input",
  },
});
