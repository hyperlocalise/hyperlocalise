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
    id: "r0nRyWm8P2",
    description: "Accessible label to collapse an issue status group",
  },
  expandGroupAria: {
    defaultMessage: "Expand {status}",
    id: "XJ2TnPULLw",
    description: "Accessible label to expand an issue status group",
  },
  groupCount: {
    defaultMessage: "{count}",
    id: "mnVXdjX04g",
    description: "Issue count shown on a status group header",
  },
  emptyValue: {
    defaultMessage: "—",
    id: "pBNUlB/NOC",
    description: "Placeholder when an issue list cell has no value",
  },
  loadingAria: {
    defaultMessage: "Loading issues",
    id: "AUIhlLFYDp",
    description: "Accessible label while the grouped issue list is loading",
  },
});
