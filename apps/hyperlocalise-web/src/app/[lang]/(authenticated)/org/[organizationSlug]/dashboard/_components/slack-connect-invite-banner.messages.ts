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
    defaultMessage: "Create a shared Slack channel",
    id: "k2sC1nQv7a",
    description: "Dashboard Slack Connect banner title before the first invite",
  },
  createDescription: {
    defaultMessage:
      "Talk with Hyperlocalise in Slack. We'll email you an invitation to a shared channel.",
    id: "p9Lm2wXe4b",
    description: "Dashboard Slack Connect banner description before the first invite",
  },
  invitedTitle: {
    defaultMessage: "We've invited your team to a shared Slack channel",
    id: "r4Td8yBn0c",
    description: "Dashboard Slack Connect banner title after an invite was sent",
  },
  invitedDescription: {
    defaultMessage: "Check your email for an invitation to the channel or request a new invite.",
    id: "s7Uf1zCo3d",
    description: "Dashboard Slack Connect banner description after an invite was sent",
  },
  dismiss: {
    defaultMessage: "Dismiss",
    id: "t0Vg2ADp6e",
    description: "Dashboard Slack Connect banner dismiss action",
  },
  requestInvite: {
    defaultMessage: "Request Slack invite",
    id: "u3Wh5BEq9f",
    description: "Dashboard Slack Connect banner primary action",
  },
  requesting: {
    defaultMessage: "Sending…",
    id: "v6Xi8CFr2g",
    description: "Dashboard Slack Connect banner primary action while sending",
  },
  requestSuccess: {
    defaultMessage: "Check your email for the Slack channel invite.",
    id: "w9Yj0DGs5h",
    description: "Toast after a Slack Connect invite is sent",
  },
  requestFailed: {
    defaultMessage: "Unable to send a Slack invite right now. Try again shortly.",
    id: "x2Zk3EHt8i",
    description: "Toast when a Slack Connect invite request fails",
  },
  rateLimited: {
    defaultMessage: "An invite was just sent. Try again in a couple of minutes.",
    id: "y5Al4FIu1j",
    description: "Toast when Slack Connect invite is rate limited",
  },
  dismissFailed: {
    defaultMessage: "Unable to dismiss this invite right now.",
    id: "z8Bm5GJv4k",
    description: "Toast when dismissing the Slack Connect banner fails",
  },
  loadingLabel: {
    defaultMessage: "Loading Slack channel invite",
    id: "a1Cn6HKw7l",
    description: "Accessible label while the Slack Connect banner loads",
  },
});
