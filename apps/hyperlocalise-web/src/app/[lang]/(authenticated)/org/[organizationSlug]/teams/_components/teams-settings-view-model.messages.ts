"use client";

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
