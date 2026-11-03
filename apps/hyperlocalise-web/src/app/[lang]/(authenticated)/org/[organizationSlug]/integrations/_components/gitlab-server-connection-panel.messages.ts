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

export const gitlabServerConnectionPanelMessages = defineMessages({
  name: {
    defaultMessage: "Self-hosted GitLab",
    id: "HtShi6DFMi",
    description: "Integration row name for a workspace's own GitLab server",
  },
  description: {
    defaultMessage: "Use your company's own GitLab server for the whole workspace.",
    id: "LxPruuLaUX",
    description: "Integration row description for a workspace's own GitLab server",
  },
  connectedDescription: {
    defaultMessage: "Connected to {serverUrl} as {username}.",
    id: "TYbrzdSaf3",
    description: "Integration row description once a GitLab server is connected",
  },
  loadError: {
    defaultMessage: "Unable to load the GitLab server connection right now.",
    id: "2ge8oszx7T",
    description: "Integration row description when the connection fails to load",
  },
  checkFailed: {
    defaultMessage: "This connection isn't working: {reason}",
    id: "QD3uzJ+zZ8",
    description: "Shown when the saved GitLab server connection fails a live check",
  },
  checkUnavailable: {
    defaultMessage: "Couldn't check this connection just now.",
    id: "f28BtwGbZV",
    description: "Shown when the live check of a saved GitLab server connection can't run",
  },
  checking: {
    defaultMessage: "Checking the connection…",
    id: "tuNTrXyvA1",
    description: "Shown while the saved GitLab server connection is being checked",
  },
  checkPassed: {
    defaultMessage: "The connection is working. Token ending in {suffix}.",
    id: "9Tey3vfO9H",
    description: "Shown when the saved GitLab server connection passes a live check",
  },
  intro: {
    defaultMessage:
      "While connected, this server replaces GitLab.com for everyone in this workspace. They can reach whatever this token can reach.",
    id: "9OXmD1sseg",
    description: "Explains the effect of connecting a GitLab server",
  },
  replaceWarning: {
    defaultMessage:
      "Automations name a project by its path, so replacing or removing this connection points them at the new server, or back at GitLab.com. Chats stop using projects from the old server.",
    id: "VdrqJKSKUW",
    description: "Warning shown before replacing or removing a GitLab server connection",
  },
  serverUrlLabel: {
    defaultMessage: "Server address",
    id: "huT2nYeusR",
    description: "Label for the GitLab server address field",
  },
  tokenLabel: {
    defaultMessage: "Access token",
    id: "Xs0BVKJ7dk",
    description: "Label for the GitLab access token field",
  },
  tokenHint: {
    defaultMessage:
      "Use a token from a non-admin user, with the api scope, or read_api and read_repository for reading only.",
    id: "NIXB2viMhz",
    description: "Hint describing which GitLab access token to create",
  },
  tokenReplaceHint: {
    defaultMessage: "Enter the token again to change anything here.",
    id: "pOhsACmi7A",
    description: "Hint explaining that saving always needs the token",
  },
  showToken: {
    defaultMessage: "Show access token",
    id: "b88FiiRWt1",
    description: "Accessible label for the button that reveals the GitLab token",
  },
  hideToken: {
    defaultMessage: "Hide access token",
    id: "xSVItdTlw0",
    description: "Accessible label for the button that hides the GitLab token",
  },
  save: {
    defaultMessage: "Check and save",
    id: "C7GU6qexsm",
    description: "Button that checks and saves a GitLab server connection",
  },
  saving: {
    defaultMessage: "Checking…",
    id: "WC0JBz+4vU",
    description: "Button label while a GitLab server connection is being checked",
  },
  saved: {
    defaultMessage: "GitLab server connected.",
    id: "UDr0hZGNG/",
    description: "Toast after a GitLab server connection is saved",
  },
  saveFailed: {
    defaultMessage: "Unable to save the GitLab server connection.",
    id: "vXav6npaND",
    description: "Toast when saving a GitLab server connection fails without a reason",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "mm8ESSKJcB",
    description: "Button that removes the GitLab server connection",
  },
  disconnectConfirm: {
    defaultMessage:
      "Disconnect for the whole workspace? Automations go back to GitLab.com and chats stop using this server's projects.",
    id: "TS8IDVeEcm",
    description: "Question shown before removing the GitLab server connection",
  },
  disconnectNow: {
    defaultMessage: "Disconnect server",
    id: "MbHpGGZQUr",
    description: "Button that confirms removing the GitLab server connection",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "McapxvtDwd",
    description: "Button that keeps the GitLab server connection",
  },
  gitlabComNotUsed: {
    defaultMessage: "Not used while this workspace is connected to its own GitLab server.",
    id: "vjX9EcsHlB",
    description: "GitLab.com row description while a self-hosted GitLab server is connected",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "omW67FLa2e",
    description: "Button label while the GitLab server connection is being removed",
  },
  disconnected: {
    defaultMessage: "GitLab server disconnected.",
    id: "IiTUi5qzJ2",
    description: "Toast after the GitLab server connection is removed",
  },
  disconnectFailed: {
    defaultMessage: "Unable to disconnect the GitLab server.",
    id: "jwOzDgWMEq",
    description: "Toast when removing the GitLab server connection fails",
  },
});
