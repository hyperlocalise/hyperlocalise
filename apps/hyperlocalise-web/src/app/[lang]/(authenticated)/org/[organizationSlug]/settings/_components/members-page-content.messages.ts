"use client";

import { defineMessages } from "react-intl";

export const membersPageContentMessages = defineMessages({
  loadFailed: {
    defaultMessage: "Failed to load members",
    id: "XJe/aHS1LC",
    description: "Error when the workspace members list request fails",
  },
  inviteFailed: {
    defaultMessage: "Failed to invite member",
    id: "qWkW//wsRc",
    description: "Error when inviting a workspace member fails",
  },
  invitationSentToast: {
    defaultMessage: "Invitation sent",
    id: "ph90oK4r7v",
    description: "Success toast after inviting a workspace member",
  },
  updateRoleFailed: {
    defaultMessage: "Failed to update role",
    id: "EjuRj4Zd6r",
    description: "Error when updating a member’s role fails",
  },
  roleUpdatedToast: {
    defaultMessage: "Role updated",
    id: "3c3ZHFWngv",
    description: "Success toast after updating a member’s role",
  },
  removeFailed: {
    defaultMessage: "Failed to remove member",
    id: "nXG6iEdVXv",
    description: "Error when removing a workspace member fails",
  },
  invitationRevokedToast: {
    defaultMessage: "Invitation revoked",
    id: "/bDXY5b2qg",
    description: "Success toast after revoking a pending invitation",
  },
  memberRemovedToast: {
    defaultMessage: "Member removed",
    id: "VLSdATui0m",
    description: "Success toast after removing a workspace member",
  },
  pageLabel: {
    defaultMessage: "Workspace",
    id: "xTYiHfPy3g",
    description: "Breadcrumb-style label above the members page title",
  },
  pageTitle: {
    defaultMessage: "Members",
    id: "2+En/9xBc0",
    description: "Workspace members page heading",
  },
  pageDescription: {
    defaultMessage: "Manage workspace access, invitations, and localization roles.",
    id: "8QNV5JFMzw",
    description: "Workspace members page description",
  },
  inviteMember: {
    defaultMessage: "Invite member",
    id: "eW2eLsJu8K",
    description: "Button to open the invite member dialog",
  },
  sectionAriaLabel: {
    defaultMessage: "Workspace members",
    id: "zl55Vhhf0L",
    description: "Accessible label for the workspace members list section",
  },
  loading: {
    defaultMessage: "Loading members...",
    id: "cYAVUJiv07",
    description: "Loading state while fetching workspace members",
  },
  loadErrorTitle: {
    defaultMessage: "Members failed to load.",
    id: "3RQjQSebWm",
    description: "Error title when the members list fails to load",
  },
  loadErrorFallback: {
    defaultMessage: "Refresh the page to try again.",
    id: "5YusqFJjvU",
    description: "Fallback error guidance when loading members fails",
  },
  emptyTitle: {
    defaultMessage: "No workspace members yet",
    id: "ePmyaYpkGS",
    description: "Empty state title when the workspace has no members",
  },
  emptyDescription: {
    defaultMessage:
      "Invite teammates to assign localization ownership before work moves through the workspace.",
    id: "i0qX7/ht0A",
    description: "Empty state description for the workspace members list",
  },
  columnMember: {
    defaultMessage: "Member",
    id: "/01Ugx/idi",
    description: "Column header for member name and email",
  },
  columnStatus: {
    defaultMessage: "Status",
    id: "XeOh0cpTI1",
    description: "Column header for membership status",
  },
  columnRole: {
    defaultMessage: "Role",
    id: "eUfRa6PSO+",
    description: "Column header for membership role",
  },
  columnActions: {
    defaultMessage: "Actions",
    id: "T0J/dVp/Dp",
    description: "Column header for member row actions",
  },
  youBadge: {
    defaultMessage: "You",
    id: "OUBWr2tI7F",
    description: "Badge shown next to the current user’s member row",
  },
  revokeInvitationAria: {
    defaultMessage: "Revoke invitation for {name}",
    id: "+3ub8INH28",
    description: "Accessible label for the revoke invitation button",
  },
  removeMemberAria: {
    defaultMessage: "Remove {name}",
    id: "+91wkWHR07",
    description: "Accessible label for the remove member button",
  },
  revokeInvitation: {
    defaultMessage: "Revoke invitation",
    id: "S6HxrO1rRD",
    description: "Tooltip and dialog action to revoke a pending invitation",
  },
  removeMember: {
    defaultMessage: "Remove member",
    id: "hAjH8+r2iy",
    description: "Tooltip and dialog action to remove a workspace member",
  },
  inviteDialogTitle: {
    defaultMessage: "Invite member",
    id: "oQnxh21y9E",
    description: "Title of the invite member dialog",
  },
  inviteDialogDescription: {
    defaultMessage:
      "Send an invitation by email. They join after accepting through your identity provider.",
    id: "VzdHtrwQej",
    description: "Description of the invite member dialog",
  },
  emailLabel: {
    defaultMessage: "Email",
    id: "XbggbCCLjJ",
    description: "Label for the invite member email field",
  },
  emailPlaceholder: {
    defaultMessage: "name@company.com",
    id: "6IYfhafec6",
    description: "Placeholder for the invite member email field",
  },
  roleLabel: {
    defaultMessage: "Role",
    id: "rcANTRobpQ",
    description: "Label for the invite member role field",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "R1l6Bs+7Ss",
    description: "Cancel button in members dialogs",
  },
  sendInvitation: {
    defaultMessage: "Send invitation",
    id: "a/rFdmsZ+t",
    description: "Submit button to send a workspace invitation",
  },
  revokeDialogDescription: {
    defaultMessage: "{email} will no longer be able to accept this workspace invitation.",
    id: "Lod4vy7+T/",
    description: "Confirmation description when revoking a pending invitation",
  },
  removeDialogDescription: {
    defaultMessage: "{name} will lose access to this workspace.",
    id: "eF0J1/tgUY",
    description: "Confirmation description when removing a workspace member",
  },
});
