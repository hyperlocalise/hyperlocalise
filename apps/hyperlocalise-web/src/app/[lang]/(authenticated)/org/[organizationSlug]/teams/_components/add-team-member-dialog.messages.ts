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

export const addTeamMemberDialogMessages = defineMessages({
  title: {
    defaultMessage: "Add team member",
    id: "Rnm9kBTKL/",
    description: "Title of the add team member dialog",
  },
  description: {
    defaultMessage:
      "Assign an existing workspace member to this team. People must already belong to the workspace before they can join a team.",
    id: "RWjNPOBQ+S",
    description: "Description of the add team member dialog",
  },
  everyoneAlreadyOnTeam: {
    defaultMessage: "Everyone in this workspace is already on the team.",
    id: "PXpU01XAii",
    description: "Empty state when no assignable members remain",
  },
  memberLabel: {
    defaultMessage: "Member",
    id: "3tBZU7JUcu",
    description: "Label for the member select in the add team member dialog",
  },
  selectMemberPlaceholder: {
    defaultMessage: "Select a member",
    id: "oeVZ6ETPjK",
    description: "Placeholder for the member select",
  },
  roleLabel: {
    defaultMessage: "Role",
    id: "VaaPQXovs9",
    description: "Label for the team role select",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "j6Jw8eFz2s",
    description: "Cancel button in the add team member dialog footer",
  },
  adding: {
    defaultMessage: "Adding...",
    id: "S+mzU53tQz",
    description: "Submit button label while a member is being added",
  },
  addMember: {
    defaultMessage: "Add member",
    id: "hiEPeRn6WE",
    description: "Submit button to add a member to the team",
  },
});
