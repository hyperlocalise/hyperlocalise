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

export const membersSettingsViewModelMessages = defineMessages({
  roleAdmin: {
    defaultMessage: "Admin",
    id: "F4v+IVXT0a",
    description: "Organization membership role label for admins",
  },
  roleLocalizationManager: {
    defaultMessage: "Localization manager",
    id: "rO2fGo88vp",
    description: "Organization membership role label for localization managers",
  },
  roleDeveloper: {
    defaultMessage: "Developer",
    id: "UcF3Gc/Vdi",
    description: "Organization membership role label for developers",
  },
  roleReviewer: {
    defaultMessage: "Reviewer",
    id: "7jRs0G5CKj",
    description: "Organization membership role label for reviewers",
  },
  roleTranslator: {
    defaultMessage: "Translator",
    id: "JSKKU7Lpex",
    description: "Organization membership role label for translators",
  },
  roleMember: {
    defaultMessage: "Member",
    id: "nOCS+qmeJF",
    description: "Organization membership role label for members",
  },
  roleAdminDescription: {
    defaultMessage: "Full workspace control including billing and organization settings.",
    id: "PxhmMvItIU",
    description: "Description of the organization admin role",
  },
  roleLocalizationManagerDescription: {
    defaultMessage:
      "Operate projects, integrations, credentials, teams, and knowledge resources; approve reviews and write-back.",
    id: "GOx0phpLcM",
    description: "Description of the localization manager role",
  },
  roleDeveloperDescription: {
    defaultMessage:
      "Manage projects and technical jobs (sync, repositories); read integrations. No review approval or org admin.",
    id: "QFkKzM5E7a",
    description: "Description of the developer role",
  },
  roleReviewerDescription: {
    defaultMessage:
      "Contribute to jobs and run AI actions; approve reviews and write-back. No organization administration.",
    id: "0vM9ZUQzKc",
    description: "Description of the reviewer role",
  },
  roleTranslatorDescription: {
    defaultMessage:
      "Contribute to assigned jobs, run AI actions, and push draft translations. No approvals or org administration.",
    id: "m56uSee40N",
    description: "Description of the translator role",
  },
  roleMemberDescription: {
    defaultMessage: "Read workspace, project, team, glossary, memory, and job surfaces.",
    id: "BuGVGob/k5",
    description: "Description of the member role",
  },
  statusPending: {
    defaultMessage: "Pending",
    id: "WhMZXjHjRn",
    description: "Membership status label when an invitation has not been accepted",
  },
  statusActive: {
    defaultMessage: "Active",
    id: "LC2bgUm6Db",
    description: "Membership status label for an active workspace member",
  },
  statusPendingDescription: {
    defaultMessage: "Invitation sent; access starts after they accept.",
    id: "eYMRp4gEgK",
    description: "Description of the pending invitation membership status",
  },
  statusActiveDescription: {
    defaultMessage: "Signed in with an active workspace membership.",
    id: "3tXI2g+04n",
    description: "Description of the active membership status",
  },
  manualLocalizationAccessNotice: {
    defaultMessage:
      "Localization roles are assigned manually in Hyperlocalise. They are not synced from SCIM directory groups.",
    id: "shqQx7NEn2",
    description: "Notice that localization roles are managed in-app rather than via SCIM",
  },
});
