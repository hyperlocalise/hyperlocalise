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

export const codeBlockMessages = defineMessages({
  copied: {
    id: "FcsO6dYpho",

    defaultMessage: "Copied!",
    description: "Tooltip after code is copied to the clipboard",
  },
  copyCode: {
    id: "TnzQT7gNHf",

    defaultMessage: "Copy code",
    description: "Tooltip and aria label for the copy code button",
  },
});
