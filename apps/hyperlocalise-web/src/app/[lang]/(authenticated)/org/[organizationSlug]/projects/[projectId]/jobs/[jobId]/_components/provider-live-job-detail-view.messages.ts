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

export const providerLiveJobDetailViewMessages = defineMessages({
  openInProvider: {
    defaultMessage: "Open in {providerKind}",
    id: "QUaCchKL7u",
    description: "Button label to open the live provider job in the TMS",
  },
  refreshing: {
    defaultMessage: "Refreshing…",
    id: "E1B85N8tbj",
    description: "Button label while refreshing live provider job details",
  },
  refresh: {
    defaultMessage: "Refresh",
    id: "pwtT8Y1Vhm",
    description: "Button label to refresh live provider job details",
  },
  deleting: {
    defaultMessage: "Deleting…",
    id: "puXgWXUT2y",
    description: "Button label while deleting a live provider task",
  },
  deleteTask: {
    defaultMessage: "Delete task",
    id: "b6FmkNJjkD",
    description: "Button label to delete a live Crowdin task",
  },
  viewStrings: {
    defaultMessage: "View strings",
    id: "6oebBi3G9m",
    description: "Button label to open the CAT workspace for a live provider job",
  },
});
