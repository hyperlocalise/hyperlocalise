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

export const organizationSwitcherMessages = defineMessages({
  openMenu: {
    defaultMessage: "Current workspace: {name}. Open workspace menu",
    id: "zBmkUn+lbY",
    description: "Screen-reader label for the workspace switcher trigger in the sidebar header",
  },
  switchWorkspace: {
    defaultMessage: "Switch workspace",
    id: "OLKEPlyZiF",
    description: "Label above the list of workspaces in the sidebar workspace switcher",
  },
  currentWorkspace: {
    defaultMessage: "Current workspace",
    id: "ivA1MLtmhw",
    description: "Screen-reader label for the check mark next to the active workspace",
  },
  workspaceSettings: {
    defaultMessage: "Workspace settings",
    id: "jaLdytkFWV",
    description: "Link to the workspace settings page from the sidebar workspace switcher",
  },
  members: {
    defaultMessage: "Invite and manage members",
    id: "g+jQ/HY9BW",
    description: "Link to the workspace members page from the sidebar workspace switcher",
  },
  viewAllWorkspaces: {
    defaultMessage: "View all workspaces",
    id: "odqf980/gU",
    description: "Link to the organization selection page from the sidebar workspace switcher",
  },
});
