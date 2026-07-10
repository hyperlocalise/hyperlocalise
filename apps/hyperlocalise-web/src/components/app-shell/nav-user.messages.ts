"use client";

import { defineMessages } from "react-intl";

export const navUserMessages = defineMessages({
  openAccountMenu: {
    defaultMessage: "Open account menu for {name}",
    id: "zMY6O3OGwK",
    description: "Screen-reader label for the account menu trigger button",
  },
  accountTooltip: {
    defaultMessage: "Account",
    id: "MIC7tMfqgJ",
    description: "Tooltip for the account menu button in the app shell header",
  },
  account: {
    defaultMessage: "Account",
    id: "8qa1pUW6eX",
    description: "Account settings link in the user menu",
  },
  members: {
    defaultMessage: "Members",
    id: "tUtjQfuwWO",
    description: "Workspace members link in the user menu",
  },
  apiKeys: {
    defaultMessage: "API Keys",
    id: "wsCg6j7Kx+",
    description: "API keys settings link in the user menu",
  },
  billing: {
    defaultMessage: "Billing",
    id: "36gU2d3aFl",
    description: "Billing settings link in the user menu",
  },
  switchWorkspace: {
    defaultMessage: "Switch workspace",
    id: "TG1FpMpW2X",
    description: "Submenu trigger to switch between workspaces",
  },
  workspaces: {
    defaultMessage: "Workspaces",
    id: "JpSMiCgbq5",
    description: "Label above the list of workspaces in the switch submenu",
  },
  viewAllWorkspaces: {
    defaultMessage: "View all workspaces",
    id: "do0p3JfCkF",
    description: "Link to the organization selection page from the user menu",
  },
  logOut: {
    defaultMessage: "Log out",
    id: "TbfAHmBI7l",
    description: "Sign-out action in the user account menu",
  },
});
