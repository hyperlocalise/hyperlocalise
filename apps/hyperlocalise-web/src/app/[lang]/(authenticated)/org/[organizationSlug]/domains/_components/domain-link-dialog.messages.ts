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
  editTitle: {
    defaultMessage: "Edit locales",
    id: "K6HKJyJvL1",
    description: "Domain locale dialog title",
  },
  editDescription: {
    defaultMessage: "Choose the locales to research for this domain.",
    id: "NVI4PGUZDH",
    description: "Domain locale dialog description",
  },
  save: {
    defaultMessage: "Save locales",
    id: "L1dn3JIeHU",
    description: "Save supported domain locales",
  },
  saved: {
    defaultMessage: "Locales updated for this preview.",
    id: "BGjPXD5fgV",
    description: "Prototype locale save toast",
  },
  localesRequired: {
    defaultMessage: "Select at least one locale.",
    id: "wYyC/XZMmS",
    description: "Domain locale validation",
  },
  hostnameInvalid: {
    defaultMessage: "Enter a hostname such as shop.example.com, without a URL path.",
    id: "PYIsQFA2Np",
    description: "Invalid domain hostname",
  },
  hostnameDuplicate: {
    defaultMessage: "This domain is already linked. Edit its locales instead.",
    id: "Ck9MOHJiWV",
    description: "Duplicate domain validation",
  },
  prototypeNotice: {
    defaultMessage:
      "Preview only. Changes last until you reload and are not saved to your workspace.",
    id: "4HQ7im6sof",
    description: "Prototype domain persistence disclosure",
  },
  title: {
    defaultMessage: "Link domain",
    id: "2+oKbAvHmj",
    description: "Link domain dialog title",
  },
  description: {
    defaultMessage: "Choose the locales for this hostname. Verify the domain once for all locales.",
    id: "ed78rqC5km",
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
    defaultMessage: "Locales",
    id: "vOplG6AhcP",
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
