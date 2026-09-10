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

export const domainsPageContentMessages = defineMessages({
  pageDescription: {
    defaultMessage:
      "Linked domains and the markets you research them in. Open a site to run keywords, ranks, and AI brand lookup.",
    id: "qmpjf3XZ1L",
    description: "Domains workspace page description",
  },
  loadError: {
    defaultMessage: "Could not load linked domains.",
    id: "BBrh+7z4Oj",
    description: "Error when the domains list fails to load",
  },
  linkDomain: {
    defaultMessage: "Link domain",
    id: "RjCKAD/IFR",
    description: "Open the link domain dialog",
  },
  columnDomain: {
    defaultMessage: "Domain",
    id: "//lV7u3bI3",
    description: "Domains list column for hostname",
  },
  columnMarket: {
    defaultMessage: "Market",
    id: "q4dfro4K/5",
    description: "Domains list column for market",
  },
  columnKeywords: {
    defaultMessage: "Keywords",
    id: "y0Em+Wp3gc",
    description: "Domains list column for keyword count",
  },
  columnTraffic: {
    defaultMessage: "Traffic",
    id: "uH1X4fN7MB",
    description: "Domains list column for traffic",
  },
  columnScore: {
    defaultMessage: "Score",
    id: "hBm/PWp/+S",
    description: "Domains list column for audit score",
  },
  openDomain: {
    defaultMessage: "Open",
    id: "NBDQ/KtIXb",
    description: "Open a linked domain home",
  },
  continueVerification: {
    defaultMessage: "Verify",
    id: "ANFQka6p0Z",
    description: "Link to continue verifying a pending linked domain",
  },
  scoreUnavailable: {
    defaultMessage: "—",
    id: "giZZw2GSFO",
    description: "Shown when a linked domain has no audit score",
  },
});
