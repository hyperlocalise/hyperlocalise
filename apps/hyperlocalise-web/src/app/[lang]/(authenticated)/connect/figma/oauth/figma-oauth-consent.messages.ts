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

export const figmaOauthConsentMessages = defineMessages({
  title: {
    defaultMessage: "Connect Figma to Hyperlocalise",
    id: "wvz6JBopgC",
    description: "Title for the Figma OAuth consent page",
  },
  description: {
    defaultMessage:
      "Figma is requesting access to localize designs through a Hyperlocalise workspace connection.",
    id: "lX5fkBbKOJ",
    description: "Description for the Figma OAuth consent page",
  },
  missingRequest: {
    defaultMessage:
      "This Figma authorization request is missing or expired. Start again from Figma.",
    id: "6DeonnLXWl",
    description: "Error when the Figma OAuth request cookie is missing",
  },
  noConnections: {
    defaultMessage:
      "Create a Figma connection in workspace Integrations first, then return to Figma and try again.",
    id: "2Ejjbg+BRh",
    description: "Empty state when the user has no Figma connections to authorize",
  },
  openIntegrations: {
    defaultMessage: "Open Integrations",
    id: "zL1SPi+Eok",
    description: "Link to create a Figma connection before OAuth consent",
  },
  connectionLabel: {
    defaultMessage: "Workspace connection",
    id: "rhgvK4B/v1",
    description: "Label for the Figma connection picker on the OAuth consent page",
  },
  allow: {
    defaultMessage: "Allow access",
    id: "/8khRIMh0p",
    description: "Approve Figma OAuth access",
  },
  deny: {
    defaultMessage: "Deny",
    id: "lB0h34jODa",
    description: "Deny Figma OAuth access",
  },
});
