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

export const sanityConnectionPanelMessages = defineMessages({
  authorizeUrlFailedToast: {
    defaultMessage: "Could not start Sanity authorization.",
    id: "/Fi6xT6jqV",
    description: "Toast when Sanity Pipes authorize URL fails",
  },
  disconnectFailed: {
    defaultMessage: "Could not disconnect Sanity.",
    id: "78e/wES0A+",
    description: "Toast when Sanity disconnect fails",
  },
  disconnectedToast: {
    defaultMessage: "Sanity disconnected.",
    id: "uvMAUaKYI0",
    description: "Toast after Sanity disconnect succeeds",
  },
  loadErrorDescription: {
    defaultMessage: "Could not load Sanity connection status.",
    id: "azYeK5p8pM",
    description: "Integration row description when status query fails",
  },
  comingSoonDescription: {
    defaultMessage:
      "Sanity through WorkOS Pipes is not enabled for this environment yet. An admin can enable the Sanity data integration in WorkOS.",
    id: "8O4l4wC1UK",
    description: "Integration row description when Sanity Pipes is unavailable",
  },
  connectedStatus: {
    defaultMessage: "Connected",
    id: "Obrc0xXXmw",
    description: "Heading when Sanity is connected",
  },
  tokenSuffix: {
    defaultMessage: "Token ending in {suffix}",
    id: "dU3FCBwd7f",
    description: "Shows last four characters of connected token",
  },
  connectedDescription: {
    defaultMessage:
      "Automations with the Translate Sanity documents skill use this connection to read and write drafts.",
    id: "mDQhaViqkQ",
    description: "Body copy for connected Sanity panel",
  },
  projectsLabel: {
    defaultMessage: "Manage API projects visible to this token",
    id: "MWDDRmwK/N",
    description: "Label above project list",
  },
  noProjects: {
    defaultMessage: "No projects returned for this token.",
    id: "cI9DCPgYRt",
    description: "Empty state when project list is empty",
  },
  openAutomations: {
    defaultMessage: "Open automations",
    id: "cwHz/23Qd9",
    description: "Link to automations list",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "5HqlbunlrW",
    description: "Disconnect Sanity button",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "2N6/VNF+/O",
    description: "Disconnect in progress",
  },
  authenticationMethodLabel: {
    defaultMessage: "Authentication method",
    id: "wdsH3flxH3",
    description: "Label for Sanity OAuth vs API token selector",
  },
  authenticationMethodDescription: {
    defaultMessage:
      "Choose OAuth or an API token. OAuth is recommended when your Sanity org supports it.",
    id: "37iUcUTgh4",
    description: "Helper text for Sanity authentication method selector",
  },
  oauthMethodOption: {
    defaultMessage: "OAuth (recommended)",
    id: "C+kMaPXlg0",
    description: "Sanity authentication method option for OAuth",
  },
  apiTokenMethodOption: {
    defaultMessage: "API token",
    id: "s7/k1C/6Q6",
    description: "Sanity authentication method option for API token",
  },
  oauthConnectIntro: {
    defaultMessage: "Authorize Hyperlocalise to access Sanity on your behalf through WorkOS Pipes.",
    id: "ZT3mGAyTVi",
    description: "Intro when connecting Sanity with OAuth",
  },
  apiTokenConnectIntro: {
    defaultMessage:
      "Paste a token from sanity.io/manage. It needs Editor access or higher so automations can read content and write drafts.",
    id: "KQrP3D1Cl+",
    description: "Intro when connecting Sanity with an API token",
  },
  oauthConnectedTitle: {
    defaultMessage: "Sanity authorized with OAuth",
    id: "k68En99ftY",
    description: "Heading when Sanity is connected via OAuth",
  },
  oauthConnectedDescription: {
    defaultMessage: "Hyperlocalise uses your authorized Sanity session for import and draft push.",
    id: "gz/zpenPqj",
    description: "Body when Sanity is connected via OAuth",
  },
  apiTokenConnectedTitle: {
    defaultMessage: "Sanity connected with API token",
    id: "JBRAW5Gd9X",
    description: "Heading when Sanity is connected via API token",
  },
  apiTokenConnectedDescription: {
    defaultMessage: "Paste a new token below to rotate credentials without disconnecting.",
    id: "bq5pHENeIr",
    description: "Body when Sanity is connected via API token",
  },
  apiTokenLabel: {
    defaultMessage: "API token",
    id: "qVCnKrNijs",
    description: "Label for Sanity API token input",
  },
  apiTokenHint: {
    defaultMessage: "Create the token in Sanity Manage under API → Tokens.",
    id: "nODFNuVkFL",
    description: "Hint for new Sanity API token",
  },
  apiTokenRotateHint: {
    defaultMessage: "Leave blank to keep the current token.",
    id: "dci2Dmteni",
    description: "Hint when rotating an existing Sanity API token",
  },
  showApiTokenAriaLabel: {
    defaultMessage: "Show API token",
    id: "5Cmf9xtwtk",
    description: "Aria label to reveal Sanity API token field",
  },
  hideApiTokenAriaLabel: {
    defaultMessage: "Hide API token",
    id: "tJ8Lpden5r",
    description: "Aria label to hide Sanity API token field",
  },
  oauthConnectButton: {
    defaultMessage: "Authorize with Sanity",
    id: "rqU5fqNTYZ",
    description: "Button to start Sanity OAuth via WorkOS Pipes",
  },
  oauthConnectingButton: {
    defaultMessage: "Redirecting…",
    id: "pm1TRAF3RM",
    description: "Button label while Sanity OAuth URL loads",
  },
  saveApiToken: {
    defaultMessage: "Save token",
    id: "ra9Bi4NXJ2",
    description: "Save Sanity API token button",
  },
  savingApiToken: {
    defaultMessage: "Saving…",
    id: "Rp3MUONO/3",
    description: "Save in progress for Sanity API token",
  },
  saveApiTokenFailed: {
    defaultMessage: "Could not save the Sanity API token.",
    id: "WaxO5rJ9N1",
    description: "Toast when Sanity API token save fails",
  },
  saveApiTokenSucceeded: {
    defaultMessage: "Sanity API token saved.",
    id: "BEyFxTibmH",
    description: "Toast after Sanity API token save succeeds",
  },
});
