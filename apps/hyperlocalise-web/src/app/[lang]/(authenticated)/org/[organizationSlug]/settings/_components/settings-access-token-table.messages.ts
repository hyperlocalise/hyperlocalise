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

export const settingsAccessTokenTableMessages = defineMessages({
  columnName: {
    defaultMessage: "Name",
    id: "2R03YSFY/i",
    description: "Column header for access token name",
  },
  columnPrefix: {
    defaultMessage: "Prefix",
    id: "yr0WGQ/M+B",
    description: "Column header for access token prefix",
  },
  columnPermissions: {
    defaultMessage: "Permissions",
    id: "Fn/nrZx7P/",
    description: "Column header for access token permissions",
  },
  columnLastUsed: {
    defaultMessage: "Last used",
    id: "AeU2Es47Pk",
    description: "Column header for access token last-used time",
  },
  startsWithPrefix: {
    defaultMessage: "Starts with {prefix}",
    id: "UIvzDxY9Tn",
    description: "Access token prefix shown in the tokens table",
  },
});
