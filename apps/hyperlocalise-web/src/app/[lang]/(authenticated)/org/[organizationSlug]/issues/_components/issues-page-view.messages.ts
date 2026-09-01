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

export const issuesPageViewMessages = defineMessages({
  pageTitle: {
    defaultMessage: "Board",
    id: "C5SPm8Zbbu",
    description: "Workspace board page title",
  },
  pageDescription: {
    defaultMessage: "Triage open work across this workspace.",
    id: "46zk0LJShA",
    description: "Short description under the workspace Board page title",
  },
  loadError: {
    defaultMessage: "The board could not be loaded.",
    id: "4Bnw8oUCip",
    description: "Error state when the workspace board fails to load",
  },
  empty: {
    defaultMessage: "No issues match this view.",
    id: "rWc6Iosb8n",
    description: "Empty state when the filtered workspace issues list has no rows",
  },
  loadingMore: {
    defaultMessage: "Loading...",
    id: "aaZ+fOJPdY",
    description: "Button label while more workspace issues are loading",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "Mb+6tFSPF+",
    description: "Button to load more workspace issues",
  },
});
