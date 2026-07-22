"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const teamsSettingsViewModelMessages = defineMessages({
  roleManager: {
    defaultMessage: "Manager",
    id: "KgPZ5Uqgat",
    description: "Team role label for managers",
  },
  roleMember: {
    defaultMessage: "Member",
    id: "OZfnTzJi03",
    description: "Team role label for members",
  },
  roleManagerDescription: {
    defaultMessage: "Can add or remove people and update team membership roles.",
    id: "AHcGbeiVhJ",
    description: "Tooltip describing the team manager role",
  },
  roleMemberDescription: {
    defaultMessage: "Can access projects and work assigned to this team.",
    id: "Z91mmC1MhD",
    description: "Tooltip describing the team member role",
  },
});
