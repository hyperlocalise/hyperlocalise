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

export const rolePermissionsPageViewMessages = defineMessages({
  pageLabel: {
    defaultMessage: "Workspace",
    id: "qxK7wREk5o",
    description: "Breadcrumb-style label above the role permissions page title",
  },
  pageTitle: {
    defaultMessage: "Role permissions",
    id: "0pg6zXLFtI",
    description: "Role permissions page heading",
  },
  pageDescription: {
    defaultMessage:
      "What each workspace role can do. A mark means allowed. Empty means not allowed.",
    id: "gy+E1G7FV0",
    description: "Role permissions page description",
  },
  backToMembers: {
    defaultMessage: "Members",
    id: "gMK6GFoBBA",
    description: "Back link from role permissions to the members list",
  },
  matrixAriaLabel: {
    defaultMessage: "Role permission matrix",
    id: "Fe6NxNaeWi",
    description: "Accessible name for the role permission matrix",
  },
  columnPermission: {
    defaultMessage: "Permission",
    id: "sTY0HjJCgH",
    description: "Column header for permission names in the role matrix",
  },
  groupWork: {
    defaultMessage: "Work",
    id: "aQCAPll/8g",
    description: "Role permission matrix group for job and project work",
  },
  groupPeople: {
    defaultMessage: "People",
    id: "jlhNAM1L3Z",
    description: "Role permission matrix group for inviting people and managing teams",
  },
  groupWorkspace: {
    defaultMessage: "Workspace",
    id: "XzqRCb9LWK",
    description: "Role permission matrix group for workspace settings and billing",
  },
  rowViewWorkspace: {
    defaultMessage: "View workspace",
    id: "7qX3gQkmz8",
    description: "Permission row for reading the workspace",
  },
  rowViewProjects: {
    defaultMessage: "View projects",
    id: "US6u2ypJBV",
    description: "Permission row for reading projects",
  },
  rowViewJobs: {
    defaultMessage: "View jobs",
    id: "7JxV+XlcQy",
    description: "Permission row for reading jobs",
  },
  rowWorkJobs: {
    defaultMessage: "Work on jobs",
    id: "rYa7wjb2DF",
    description: "Permission row for writing jobs",
  },
  rowRunAi: {
    defaultMessage: "Run AI",
    id: "OYX4uMwpwD",
    description: "Permission row for running AI actions",
  },
  rowPushDrafts: {
    defaultMessage: "Push draft translations",
    id: "oEmsIJPKd5",
    description: "Permission row for pushing draft translations",
  },
  rowApproveReviews: {
    defaultMessage: "Approve reviews",
    id: "n7kQpjbGxA",
    description: "Permission row for approving reviews",
  },
  rowApproveWriteBack: {
    defaultMessage: "Approve write-back",
    id: "Y/Ta4tMAG1",
    description: "Permission row for approving write-back",
  },
  rowCreateProjects: {
    defaultMessage: "Create projects",
    id: "kQCAngZDoM",
    description: "Permission row for creating projects",
  },
  rowManageProjects: {
    defaultMessage: "Manage projects",
    id: "rI3RUd2o85",
    description: "Permission row for managing projects",
  },
  rowInvitePeople: {
    defaultMessage: "Invite people",
    id: "LICkSSM/jQ",
    description: "Permission row for inviting members",
  },
  rowManageTeams: {
    defaultMessage: "Manage teams",
    id: "ALBGSq9MmL",
    description: "Permission row for managing teams",
  },
  rowEditGlossaries: {
    defaultMessage: "Edit glossaries",
    id: "MBLJMvPrmC",
    description: "Permission row for editing glossaries",
  },
  rowEditMemories: {
    defaultMessage: "Edit memories",
    id: "1gdAJhh6Lk",
    description: "Permission row for editing translation memories",
  },
  rowViewIntegrations: {
    defaultMessage: "View integrations",
    id: "BCsSQdOvtG",
    description: "Permission row for viewing integrations",
  },
  rowManageIntegrations: {
    defaultMessage: "Manage integrations",
    id: "quhhKaWY+z",
    description: "Permission row for managing integrations",
  },
  rowManageCredentials: {
    defaultMessage: "Manage credentials",
    id: "8jOo2pj9Lk",
    description: "Permission row for managing provider credentials",
  },
  rowUpdateSettings: {
    defaultMessage: "Update workspace settings",
    id: "G6aiREcgX6",
    description: "Permission row for updating workspace settings",
  },
  rowManageBilling: {
    defaultMessage: "Manage billing",
    id: "2mJ+zZY2rg",
    description: "Permission row for managing billing",
  },
  allowed: {
    defaultMessage: "Allowed",
    id: "LcATF1z/n8",
    description: "Screen-reader label when a role has a permission",
  },
  notAllowed: {
    defaultMessage: "Not allowed",
    id: "TwAHdkAXq8",
    description: "Screen-reader label when a role does not have a permission",
  },
});
