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

export const sanityOauthConsentMessages = defineMessages({
  title: {
    defaultMessage: "Connect Sanity to Hyperlocalise",
    id: "O8GZ8KEQlv",
    description: "Title for the Sanity OAuth consent page",
  },
  description: {
    defaultMessage:
      "Sanity is requesting access to upload documents, start translation jobs, and write locales through this Hyperlocalise workspace.",
    id: "E+8Fn+px7Y",
    description: "Description for the Sanity OAuth consent page",
  },
  missingRequest: {
    defaultMessage:
      "This Sanity authorization request is missing or expired. Start again from Sanity.",
    id: "UeIGZOrfgq",
    description: "Error when the Sanity OAuth request cookie is missing",
  },
  connectionLabel: {
    defaultMessage: "Workspace connection",
    id: "Kx1E4UHhnr",
    description: "Label for the Sanity connection picker on the OAuth consent page",
  },
  organizationLabel: {
    defaultMessage: "Workspace",
    id: "iZS+Jl1+Sh",
    description: "Label for the workspace picker on the Sanity OAuth consent page",
  },
  sanityLogoAlt: {
    defaultMessage: "Sanity",
    id: "aygAD3uUfX",
    description: "Alt text for the Sanity mark on the OAuth consent page",
  },
  hyperlocaliseLogoAlt: {
    defaultMessage: "Hyperlocalise",
    id: "cszcBIv646",
    description: "Alt text for the Hyperlocalise logomark on the OAuth consent page",
  },
  allow: {
    defaultMessage: "Allow access",
    id: "uTZgj87WJT",
    description: "Approve Sanity OAuth access",
  },
  deny: {
    defaultMessage: "Deny",
    id: "3Na7+Ls1qd",
    description: "Deny Sanity OAuth access",
  },
});
