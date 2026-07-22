"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const commitMessages = defineMessages({
  copied: {
    id: "AcfkWiaJBh",

    defaultMessage: "Copied!",
    description: "Tooltip after commit hash is copied to the clipboard",
  },
  copyHash: {
    id: "y9Ij/vPLAO",

    defaultMessage: "Copy hash",
    description: "Tooltip and aria label for copying a commit hash",
  },
});
