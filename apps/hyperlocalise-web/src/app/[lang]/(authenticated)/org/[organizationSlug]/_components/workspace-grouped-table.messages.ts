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

export const workspaceGroupedTableMessages = defineMessages({
  loadMore: {
    defaultMessage: "Load more",
    id: "A9V2j23Vmp",
    description: "Button to load more rows in a grouped workspace table",
  },
  loadingMore: {
    defaultMessage: "Loading...",
    id: "O+SyRYA2GG",
    description: "Pending label while a grouped workspace table loads more rows",
  },
  loadFailed: {
    defaultMessage: "Could not load this group.",
    id: "3B+Q6o17x+",
    description: "Error heading when a grouped workspace table section fails to load",
  },
  loadFailedFallback: {
    defaultMessage: "Try again.",
    id: "oh23JqGlqV",
    description: "Fallback error when a grouped workspace table section fails without a message",
  },
  retry: {
    defaultMessage: "Retry",
    id: "36DEQtJShc",
    description: "Button to retry loading a grouped workspace table section",
  },
  expandGroupAria: {
    defaultMessage: "Expand {group}",
    id: "YeHqxQ/NY/",
    description: "Accessible label to expand a grouped workspace table section",
  },
  collapseGroupAria: {
    defaultMessage: "Collapse {group}",
    id: "0L3Yw4+ww7",
    description: "Accessible label to collapse a grouped workspace table section",
  },
});
