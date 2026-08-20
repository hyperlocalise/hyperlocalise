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

export const issueGroupedListMessages = defineMessages({
  collapseGroupAria: {
    defaultMessage: "Collapse {status}",
    id: "NRH7Cv54cL",
    description: "Accessible label to collapse an issue status group",
  },
  expandGroupAria: {
    defaultMessage: "Expand {status}",
    id: "BdS7ZiKy6/",
    description: "Accessible label to expand an issue status group",
  },
  emptyValue: {
    defaultMessage: "—",
    id: "MgM7OBu7rL",
    description: "Placeholder when an issue list cell has no value",
  },
  loadingAria: {
    defaultMessage: "Loading issues",
    id: "YGfWnIp6A9",
    description: "Accessible label while the grouped issue list is loading",
  },
  rowSelectAria: {
    defaultMessage: "Select issue {title}",
    id: "82drjDfpox",
    description: "Accessible label for selecting an issue row for bulk actions",
  },
});
