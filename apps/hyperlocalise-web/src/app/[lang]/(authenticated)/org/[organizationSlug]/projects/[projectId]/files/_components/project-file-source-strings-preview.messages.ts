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

export const projectFileSourceStringsPreviewMessages = defineMessages({
  stringCount: {
    defaultMessage: "{count, plural, one {# string} other {# strings}}",
    id: "R8S6VU1Upj",
    description: "Count of source strings shown in the file preview",
  },
  stringCountTruncated: {
    defaultMessage: "{count, plural, one {# string} other {# strings}} (preview truncated)",
    id: "ggf5heOubM",
    description: "Count of source strings when the preview list is truncated",
  },
  keyColumn: {
    defaultMessage: "Key",
    id: "BkcBYxLJtW",
    description: "Column header for translation keys in the source strings preview table",
  },
  textColumn: {
    defaultMessage: "Text",
    id: "7wIRX6GiLH",
    description: "Column header for source text in the source strings preview table",
  },
  contextColumn: {
    defaultMessage: "Context",
    id: "F8EegdWpYQ",
    description: "Column header for string context in the source strings preview table",
  },
  emptyContext: {
    defaultMessage: "—",
    id: "Kua+B+Kq3s",
    description: "Placeholder shown when a source string has no context",
  },
});
