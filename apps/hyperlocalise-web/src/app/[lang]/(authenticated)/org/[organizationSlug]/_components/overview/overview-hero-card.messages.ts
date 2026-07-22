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

export const overviewHeroCardMessages = defineMessages({
  allCaughtUp: {
    defaultMessage: "All caught up",
    id: "CDHpNJeAfK",
    description: "Overview hero badge when there are no pending actions",
  },
  pendingActions: {
    defaultMessage: "{count, plural, one {# pending action} other {# pending actions}}",
    id: "CzEPtyNc5S",
    description: "Overview hero badge showing how many pending actions remain",
  },
});
