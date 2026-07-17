"use client";

import { defineMessages } from "react-intl";

export const teamDetailPageViewMessages = defineMessages({
  columnMember: {
    defaultMessage: "Member",
    id: "b7wwLWokOY",
    description: "Team members table column header for member email",
  },
  columnRole: {
    defaultMessage: "Role",
    id: "1XoRKevTzz",
    description: "Team members table column header for role",
  },
  columnActions: {
    defaultMessage: "Actions",
    id: "GRWKZQ9lbF",
    description: "Screen-reader label for the members table actions column",
  },
  actionsForMember: {
    defaultMessage: "Actions for {email}",
    id: "jletyEWDwl",
    description: "Accessible label for a team member row actions menu",
  },
  removeFromTeam: {
    defaultMessage: "Remove from team...",
    id: "BkNjvJSOTT",
    description: "Menu item to remove a member from the team",
  },
  backToTeams: {
    defaultMessage: "Back to teams",
    id: "wtUAi5KCmb",
    description: "Link back to the workspace teams list",
  },
  pageLabel: {
    defaultMessage: "Team",
    id: "SFMLZ4RNJi",
    description: "Eyebrow label above the team detail page title",
  },
  pageTitleFallback: {
    defaultMessage: "Team",
    id: "gI8N/Ms4so",
    description: "Fallback team detail page title while the team is loading",
  },
  pageDescriptionWithSlug: {
    defaultMessage: "Manage membership and roles for the {slug} team.",
    id: "vrxnOkVw+Z",
    description: "Team detail page description when the team slug is known",
  },
  pageDescriptionLoading: {
    defaultMessage: "Load team membership and roles.",
    id: "NTnOgDMsrG",
    description: "Team detail page description while the team is loading",
  },
  editTeam: {
    defaultMessage: "Edit team",
    id: "cAGL69hzyh",
    description: "Button to open the edit team dialog on the detail page",
  },
  sectionLabel: {
    defaultMessage: "Team members",
    id: "3iZn32bnuU",
    description: "Accessible label for the team members section",
  },
  membersHeading: {
    defaultMessage: "Members",
    id: "ke25Z8UYMw",
    description: "Heading above the team members list",
  },
  membersDescription: {
    defaultMessage:
      "People assigned to this team can access its projects and jobs. Need someone new in the workspace? <invite>Invite a member</invite>.",
    id: "eKYKN2COzf",
    description: "Description under the members heading with an invite link",
  },
  addMember: {
    defaultMessage: "Add member",
    id: "+ImwzEWoEE",
    description: "Button to open the add team member dialog",
  },
  loading: {
    defaultMessage: "Loading team...",
    id: "JS3/JRN7Fy",
    description: "Loading state for the team detail page",
  },
  loadFailed: {
    defaultMessage: "Team failed to load.",
    id: "dWHXPEdP65",
    description: "Error heading when a team fails to load",
  },
  loadFailedFallback: {
    defaultMessage: "Refresh the page to try again.",
    id: "Hemunr1kUc",
    description: "Fallback error when a team fails to load without a message",
  },
  emptyTitle: {
    defaultMessage: "No members on this team",
    id: "CS4n4RFeFk",
    description: "Empty state title when a team has no members",
  },
  emptyDescription: {
    defaultMessage: "Add workspace members to start scoping projects and jobs to this team.",
    id: "KQDlfibJWf",
    description: "Empty state description when a team has no members",
  },
  youBadge: {
    defaultMessage: "You",
    id: "+RWDHuTqY1",
    description: "Badge marking the current user in the members list",
  },
  editTeamTitle: {
    defaultMessage: "Edit team",
    id: "McBaOEOgmY",
    description: "Title of the edit team dialog on the detail page",
  },
  editTeamDescription: {
    defaultMessage: "Update the team name or slug used for project scoping.",
    id: "9YjuTKjSna",
    description: "Description of the edit team dialog on the detail page",
  },
  removeMemberTitle: {
    defaultMessage: "Remove team member",
    id: "UqeBgW87bt",
    description: "Title of the remove team member confirmation dialog",
  },
  removeMemberDescription: {
    defaultMessage: "{email} will lose access to projects scoped to this team.",
    id: "Z6vGjRVdyz",
    description: "Remove member confirmation when the member email is known",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "Nx+ZrjUtj2",
    description: "Cancel button in the remove member dialog",
  },
  removeMemberConfirm: {
    defaultMessage: "Remove member",
    id: "N/k3pDV14E",
    description: "Confirm button to remove a team member",
  },
});
