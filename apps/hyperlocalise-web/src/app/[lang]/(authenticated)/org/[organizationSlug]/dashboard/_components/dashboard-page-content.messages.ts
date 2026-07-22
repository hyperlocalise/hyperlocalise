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

export const dashboardPageContentMessages = defineMessages({
  featureUnavailable: {
    defaultMessage: "This feature is not available for your workspace yet.",
    id: "0GW7ilY3Dj",
    description: "Toast when a user is redirected because a workspace feature is unavailable",
  },
  liveTmsJobsWarning: {
    defaultMessage: "Live TMS jobs could not be loaded.",
    id: "UOrQi3aNyW",
    description: "Warning when live TMS assigned jobs fail but native jobs loaded",
  },
  nativeJobsWarning: {
    defaultMessage: "Native workspace jobs could not be loaded.",
    id: "+KUpBJ/DPe",
    description: "Warning when native assigned jobs fail but live TMS jobs loaded",
  },
});
