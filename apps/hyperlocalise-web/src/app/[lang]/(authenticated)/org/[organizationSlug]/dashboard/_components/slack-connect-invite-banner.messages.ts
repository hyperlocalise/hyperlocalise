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

export const slackConnectInviteBannerMessages = defineMessages({
  createTitle: {
    defaultMessage: "Request Slack channel",
    id: "vT66VB97HW",
    description: "Overview Slack Connect card title before the first invite",
  },
  createDescription: {
    defaultMessage: "We'll email you an invite to a shared channel with Hyperlocalise.",
    id: "LezQD0Jh9+",
    description: "Overview Slack Connect card description before the first invite",
  },
  invitedTitle: {
    defaultMessage: "We've invited your team to a shared Slack channel",
    id: "kNbIVbtAlh",
    description: "Dashboard Slack Connect banner title after an invite was sent",
  },
  invitedDescription: {
    defaultMessage: "Check your email for an invitation to the channel or request a new invite.",
    id: "BbhzPipEsh",
    description: "Dashboard Slack Connect banner description after an invite was sent",
  },
  dismiss: {
    defaultMessage: "Dismiss",
    id: "p1EBLiYRON",
    description: "Dashboard Slack Connect banner dismiss action",
  },
  requestInvite: {
    defaultMessage: "Request invite",
    id: "dS3dXvwF6f",
    description: "Overview Slack Connect card primary action",
  },
  requesting: {
    defaultMessage: "Sending…",
    id: "BrzNDtGGWt",
    description: "Dashboard Slack Connect banner primary action while sending",
  },
  requestSuccess: {
    defaultMessage: "Check your email for the Slack channel invite.",
    id: "rDKQx99X0Z",
    description: "Toast after a Slack Connect invite is sent",
  },
  requestFailed: {
    defaultMessage: "Unable to send a Slack invite right now. Try again shortly.",
    id: "AAASbBGB98",
    description: "Toast when a Slack Connect invite request fails",
  },
  rateLimited: {
    defaultMessage: "An invite was just sent. Try again in a couple of minutes.",
    id: "akBS4XwW21",
    description: "Toast when Slack Connect invite is rate limited",
  },
  dismissFailed: {
    defaultMessage: "Unable to dismiss this invite right now.",
    id: "dOsXIMNL7P",
    description: "Toast when dismissing the Slack Connect banner fails",
  },
  loadingLabel: {
    defaultMessage: "Loading Slack channel invite",
    id: "TqRYXSejeY",
    description: "Accessible label while the Slack Connect banner loads",
  },
});
