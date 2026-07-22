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

export const teamDetailPageContentMessages = defineMessages({
  teamUpdated: {
    defaultMessage: "Team updated",
    id: "p/PBwViDjv",
    description: "Toast after team details are updated from the detail page",
  },
  memberAdded: {
    defaultMessage: "Member added to team",
    id: "118lC+/u/6",
    description: "Toast after a member is added to a team",
  },
  roleUpdated: {
    defaultMessage: "Team role updated",
    id: "HGHGAGahop",
    description: "Toast after a team member’s role is updated",
  },
  memberRemoved: {
    defaultMessage: "Member removed from team",
    id: "jd3LwSKaUe",
    description: "Toast after a member is removed from a team",
  },
});
