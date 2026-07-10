"use client";

import { defineMessages } from "react-intl";

export const crowdinUserPatConnectDialogMessages = defineMessages({
  title: {
    defaultMessage: "Connect {provider}",
    id: "1fG/7mjDdt",
    description: "Dialog title when connecting a Crowdin account with a personal access token",
  },
  description: {
    defaultMessage:
      "Paste your personal access token from Crowdin. Your admin already configured the API base URL for this workspace—you only need your token.",
    id: "6xVOEtsDdv",
    description:
      "Dialog description explaining how to connect Crowdin with a personal access token",
  },
  tokenLabel: {
    defaultMessage: "Personal access token",
    id: "XHTRGbNDAl",
    description: "Label for the Crowdin personal access token input field",
  },
  tokenHelp: {
    defaultMessage:
      "Create a token in Crowdin under Account Settings → API, or in Crowdin Enterprise under your account or Organization Settings → User Access Tokens.",
    id: "J0zJVMmJUF",
    description: "Help text describing where to create a Crowdin personal access token",
  },
  tokenPlaceholder: {
    defaultMessage: "Paste your Crowdin token",
    id: "TiPe1DO4xa",
    description: "Placeholder for the Crowdin personal access token input",
  },
  hideToken: {
    defaultMessage: "Hide token",
    id: "jeSX+Yj7ku",
    description: "Accessible label to hide the personal access token value",
  },
  showToken: {
    defaultMessage: "Show token",
    id: "toaWaws2L2",
    description: "Accessible label to reveal the personal access token value",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "jbZZYRafrx",
    description: "Cancel button that closes the Crowdin PAT connect dialog",
  },
  connect: {
    defaultMessage: "Connect",
    id: "qySc0NPK9C",
    description: "Primary button to submit the Crowdin personal access token",
  },
  connecting: {
    defaultMessage: "Connecting...",
    id: "jCBwr9gFgn",
    description: "Pending label while Crowdin personal access token connection is in progress",
  },
  connectFailed: {
    defaultMessage: "Failed to connect Crowdin",
    id: "6eyR0nBKXG",
    description: "Toast error when Crowdin personal access token connection fails",
  },
  connected: {
    defaultMessage: "{provider} connected",
    id: "df83PL1R8p",
    description: "Toast success after connecting a Crowdin account with a personal access token",
  },
});
