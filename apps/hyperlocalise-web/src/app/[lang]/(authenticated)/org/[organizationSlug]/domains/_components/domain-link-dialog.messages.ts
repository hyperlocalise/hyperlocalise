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

export const domainLinkDialogMessages = defineMessages({
  title: {
    defaultMessage: "Link domain",
    id: "2+oKbAvHmj",
    description: "Link domain dialog title",
  },
  description: {
    defaultMessage:
      "Attach a hostname and pick the market research should run in. Verification comes next.",
    id: "hJh6vnt3pF",
    description: "Link domain dialog description",
  },
  hostnameLabel: {
    defaultMessage: "Hostname",
    id: "QzCT9StKW7",
    description: "Hostname field on the link domain dialog",
  },
  hostnamePlaceholder: {
    defaultMessage: "shop.example.com",
    id: "oV4/G//JgO",
    description: "Hostname placeholder on the link domain dialog",
  },
  marketLabel: {
    defaultMessage: "Market",
    id: "SJ1G8g/3h7",
    description: "Market field on the link domain dialog",
  },
  submit: {
    defaultMessage: "Continue to verification",
    id: "lt5CygG2lb",
    description: "Submit the link domain dialog",
  },
  hostnameRequired: {
    defaultMessage: "Enter a hostname.",
    id: "tyAE2cKpjv",
    description: "Validation when the hostname is missing",
  },
  success: {
    defaultMessage: "Domain queued. Add the DNS record to finish linking.",
    id: "UF5RFmfnwB",
    description: "Toast after linking a domain in the prototype",
  },
});
