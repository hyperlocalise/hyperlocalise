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

export const teamDetailPageContentMessages = defineMessages({
  loadFailed: {
    defaultMessage: "Unable to load team details.",
    id: "7aLZ0dWTTK",
    description: "Error loading team details",
  },
  updateFailed: {
    defaultMessage: "Unable to update team.",
    id: 'RYlIDTbR9C',
    description: "Error updating team details",
  },
  addMemberFailed: {
    defaultMessage: "Unable to add member to team.",
    id: 'XaU9VG5iR6',
    description: "Error adding a member to a team",
  },
  roleUpdateFailed: {
    defaultMessage: "Unable to update team role.",
    id: 'DZQygr4PBW',
    description: "Error updating a team member role",
  },
  removeMemberFailed: {
    defaultMessage: "Unable to remove member from team.",
    id: 'nMNoXhRMk/',
    description: "Error removing a member from a team",
  },
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
