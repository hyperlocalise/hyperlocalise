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

export const teamsPageViewMessages = defineMessages({
  columnTeam: {
    defaultMessage: "Team",
    id: "h11M7dgCU3",
    description: "Teams table column header for team name",
  },
  columnSlug: {
    defaultMessage: "Slug",
    id: "JBzesbmAoL",
    description: "Teams table column header for team slug",
  },
  columnYourRole: {
    defaultMessage: "Your role",
    id: "bpqqgx/kva",
    description: "Teams table column header for the current user’s role",
  },
  columnMembers: {
    defaultMessage: "Members",
    id: "zZs7tzKcIn",
    description: "Teams table column header for member count",
  },
  columnActions: {
    defaultMessage: "Actions",
    id: "3rELHi7DJJ",
    description: "Screen-reader label for the teams table actions column",
  },
  actionsForTeam: {
    defaultMessage: "Actions for {teamName}",
    id: "vLcCxwUDbQ",
    description: "Accessible label for a team row actions menu",
  },
  openTeam: {
    defaultMessage: "Open team",
    id: "LqefsWsyri",
    description: "Menu item to open a team detail page",
  },
  editTeam: {
    defaultMessage: "Edit team...",
    id: "jNzAYm1gdg",
    description: "Menu item to open the edit team dialog",
  },
  manageMembers: {
    defaultMessage: "Manage members...",
    id: "waagTqlJ5r",
    description: "Menu item to manage team members",
  },
  deleteTeamMenu: {
    defaultMessage: "Delete team...",
    id: "inv55FPnya",
    description: "Menu item to open the delete team confirmation",
  },
  pageLabel: {
    defaultMessage: "Workspace",
    id: "9Sp/POP1Pn",
    description: "Eyebrow label above the teams page title",
  },
  pageTitle: {
    defaultMessage: "Teams",
    id: "sGkYArMEbA",
    description: "Teams page title",
  },
  pageDescription: {
    defaultMessage: "Group people into teams to scope projects, jobs, and localization ownership.",
    id: "zDFrDsXQnc",
    description: "Teams page description",
  },
  createTeam: {
    defaultMessage: "Create team",
    id: "kf0aB8NC11",
    description: "Button to open the create team dialog",
  },
  sectionLabel: {
    defaultMessage: "Workspace teams",
    id: "9n4esczT5X",
    description: "Accessible label for the teams list section",
  },
  loading: {
    defaultMessage: "Loading teams...",
    id: "fpXSPN+8qa",
    description: "Loading state for the teams list",
  },
  loadFailed: {
    defaultMessage: "Teams failed to load.",
    id: "uAwYoMQSJA",
    description: "Error heading when teams fail to load",
  },
  loadFailedFallback: {
    defaultMessage: "Refresh the page to try again.",
    id: "QHSMConoTh",
    description: "Fallback error when teams fail to load without a message",
  },
  emptyTitle: {
    defaultMessage: "No teams yet",
    id: "XzH5GON6Rv",
    description: "Empty state title when the workspace has no teams",
  },
  emptyDescription: {
    defaultMessage:
      "Create a team to group workspace members and scope project access. Invite people on the <members>Members</members> page first if your workspace is still empty.",
    id: "vUbrtmWuOu",
    description: "Empty state description with a link to the members page",
  },
  noRole: {
    defaultMessage: "—",
    id: "F7mBujjsRG",
    description: "Placeholder when the current user has no role on a team",
  },
  createTeamTitle: {
    defaultMessage: "Create team",
    id: "41LGUaV8nc",
    description: "Title of the create team dialog",
  },
  createTeamDescription: {
    defaultMessage: "Teams group workspace members and scope which projects they can access.",
    id: "gesmb9XaV+",
    description: "Description of the create team dialog",
  },
  editTeamTitle: {
    defaultMessage: "Edit team",
    id: "YeNii+JHGo",
    description: "Title of the edit team dialog on the teams list page",
  },
  editTeamDescription: {
    defaultMessage: "Update the team name or slug used across the workspace.",
    id: "n+YVQESgnK",
    description: "Description of the edit team dialog on the teams list page",
  },
  deleteTeamTitle: {
    defaultMessage: "Delete team",
    id: "BavpDSRiE2",
    description: "Title of the delete team confirmation dialog",
  },
  deleteTeamDescription: {
    defaultMessage:
      "{teamName} will be removed and members will lose team-scoped access tied to it.",
    id: "Q2OuXlhfDS",
    description: "Delete team confirmation when the team name is known",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "g1PbE9rfHL",
    description: "Cancel button in the delete team dialog",
  },
  deleteTeamConfirm: {
    defaultMessage: "Delete team",
    id: "Yy3NR/q4ik",
    description: "Confirm button to delete a team",
  },
});
