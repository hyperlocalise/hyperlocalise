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

export const terminalMessages = defineMessages({
  title: {
    id: "1/O6U8eZiP",

    defaultMessage: "Terminal",
    description: "Default title for the terminal panel header",
  },
  copied: {
    id: "9KuYbR6KRc",

    defaultMessage: "Copied!",
    description: "Tooltip after terminal output is copied to the clipboard",
  },
  copyOutput: {
    id: "3VQO3rGiUE",

    defaultMessage: "Copy terminal output",
    description: "Tooltip and aria label for copying terminal output",
  },
});
