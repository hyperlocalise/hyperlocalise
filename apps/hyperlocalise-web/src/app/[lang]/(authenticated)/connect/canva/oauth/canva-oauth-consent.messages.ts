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

export const canvaOauthConsentMessages = defineMessages({
  title: {
    defaultMessage: "Connect Canva to Hyperlocalise",
    id: "KQoOqOSNYf",
    description: "Title for the Canva OAuth consent page",
  },
  description: {
    defaultMessage:
      "Canva is requesting access to localize designs through a Hyperlocalise workspace connection.",
    id: "Cil9vaybzd",
    description: "Description for the Canva OAuth consent page",
  },
  missingRequest: {
    defaultMessage:
      "This Canva authorization request is missing or expired. Start again from Canva.",
    id: "NyPxv6K9eG",
    description: "Error when the Canva OAuth request cookie is missing",
  },
  noConnections: {
    defaultMessage:
      "Create a Canva connection in workspace Integrations first, then return to Canva and try again.",
    id: "8QmjnmRcNl",
    description: "Empty state when the user has no Canva connections to authorize",
  },
  openIntegrations: {
    defaultMessage: "Open Integrations",
    id: "QO4tHVxQGv",
    description: "Link to create a Canva connection before OAuth consent",
  },
  connectionLabel: {
    defaultMessage: "Workspace connection",
    id: "T8LFTkce6e",
    description: "Label for the Canva connection picker on the OAuth consent page",
  },
  allow: {
    defaultMessage: "Allow access",
    id: "FsR2aF2lzP",
    description: "Approve Canva OAuth access",
  },
  deny: {
    defaultMessage: "Deny",
    id: "qz4qD1ttxo",
    description: "Deny Canva OAuth access",
  },
});
