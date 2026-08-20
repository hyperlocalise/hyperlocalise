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

export const automationTimeZoneSelectMessages = defineMessages({
  searchPlaceholder: {
    defaultMessage: "Search timezones…",
    id: "tzSelSearch1",
    description: "Placeholder for the automation timezone search input",
  },
  empty: {
    defaultMessage: "No timezones found.",
    id: "tzSelEmpty01",
    description: "Empty state when timezone search has no matches",
  },
});
