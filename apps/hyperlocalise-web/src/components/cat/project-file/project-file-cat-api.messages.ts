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

export const projectFileCatApiMessages = defineMessages({
  failedToLoadQueue: {
    defaultMessage: "Failed to load CAT queue",
    id: "lE4XkWZPD6",
    description: "Fallback error when the project file CAT queue request fails",
  },
  failedToLoadSegmentComments: {
    defaultMessage: "Failed to load segment comments",
    id: "v6QIe3eb5N",
    description: "Fallback error when loading CAT segment comments fails",
  },
  failedToLoadSegmentTranslation: {
    defaultMessage: "Failed to load segment translation",
    id: "4MUAkFDjce",
    description: "Fallback error when loading a CAT segment target translation fails",
  },
});
