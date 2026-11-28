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

export const bitbucketConnectionPanelMessages = defineMessages({
  name: {
    defaultMessage: "Bitbucket",
    id: "d5HQ4rkEPj",
    description: "Integration row name for the workspace's Bitbucket Cloud connection",
  },
  description: {
    defaultMessage:
      "Sync repository files with your projects. An admin connects it once for the whole workspace.",
    id: "OttlAapcwh",
    description: "Integration row description while the workspace hasn't connected Bitbucket",
  },
  connectedDescription: {
    defaultMessage: "Connected for the whole workspace.",
    id: "DwC1To3cUZ",
    description: "Integration row description when the workspace has connected Bitbucket",
  },
  connectedAsDescription: {
    defaultMessage: "Connected for the whole workspace as {account}.",
    id: "DRBCBNJfgl",
    description:
      "Integration row description when the workspace has connected Bitbucket; account is the Bitbucket account's name",
  },
  reconnectDescription: {
    defaultMessage: "Bitbucket needs to be connected again before project syncs can run.",
    id: "mIVet/CyFm",
    description: "Integration row description when the workspace's Bitbucket connection lapsed",
  },
  connectorLeftDescription: {
    defaultMessage:
      "The admin who connected Bitbucket has left this workspace. Connect it again so project syncs keep running.",
    id: "wuzkTh2mjI",
    description:
      "Integration row description when the admin who connected Bitbucket is no longer a member",
  },
  loadError: {
    defaultMessage: "Bitbucket's status couldn't be loaded. Refresh the page to try again.",
    id: "BRe6NIwj7J",
    description: "Integration row description when the Bitbucket connection status failed to load",
  },
  sharedHint: {
    defaultMessage:
      "Every project sync in this workspace uses this Bitbucket account and reaches the repositories it can see. Use an account that belongs only to the repositories you sync.",
    id: "c1kHhl0GZ4",
    description: "Note in the open Bitbucket row about what the shared connection reaches",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "Ma7ERYjIOT",
    description: "Button that disconnects Bitbucket from the workspace",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "YSJXvZU9UJ",
    description: "Button label while Bitbucket is being disconnected",
  },
  disconnectedToast: {
    defaultMessage:
      "Bitbucket disconnected. Project syncs that use it stop until it is connected again.",
    id: "6UMF+SVEkB",
    description: "Toast after Bitbucket was disconnected from the workspace",
  },
  disconnectFailed: {
    defaultMessage: "Bitbucket couldn't be disconnected. Try again.",
    id: "/YJ7SRIxSt",
    description: "Toast when disconnecting Bitbucket failed",
  },
  connectFailed: {
    defaultMessage: "Bitbucket sign-in couldn't be started. Try again.",
    id: "4HUdoLH/wM",
    description: "Toast when the Bitbucket sign-in page couldn't be opened",
  },
  popupBlocked: {
    defaultMessage: "Allow pop-ups for this site to sign in to Bitbucket.",
    id: "cgfcUojHJf",
    description: "Toast when the browser blocked the Bitbucket sign-in window",
  },
});
