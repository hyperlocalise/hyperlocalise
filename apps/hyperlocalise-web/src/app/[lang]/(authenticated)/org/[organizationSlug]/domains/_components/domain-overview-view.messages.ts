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

export const domainOverviewViewMessages = defineMessages({
  keywordsTab: {
    defaultMessage: "Keywords",
    id: "b04WpJPIZh",
    description: "Domain overview tab for ranking keywords",
  },
  pagesTab: {
    defaultMessage: "Pages",
    id: "48liY3M4is",
    description: "Domain overview tab for ranking pages",
  },
  columnKeyword: {
    defaultMessage: "Keyword",
    id: "zDKQV1vdb3",
    description: "Overview keyword column",
  },
  columnPosition: {
    defaultMessage: "Pos",
    id: "bOWosORc57",
    description: "Overview position column",
  },
  columnVolume: {
    defaultMessage: "Volume",
    id: "giuftZHtFk",
    description: "Overview volume column",
  },
  columnTraffic: {
    defaultMessage: "Traffic",
    id: "bH4OJBTlRQ",
    description: "Overview traffic column",
  },
  columnEstimatedTraffic: {
    defaultMessage: "Est. traffic",
    id: "vS2rZINTCg",
    description: "Overview estimated traffic column",
  },
  capturedAt: {
    defaultMessage: "Captured {date}",
    id: "NyfIu9clsR",
    description: "Overview snapshot timestamp",
  },
  refresh: {
    defaultMessage: "Refresh data",
    id: "UxD7Hy8Ypk",
    description: "Refresh provider-backed Overview",
  },
  refreshing: {
    defaultMessage: "Refreshing…",
    id: "JV74CwQ5fc",
    description: "Provider-backed Overview refresh in progress",
  },
  noSnapshot: {
    defaultMessage: "No Overview snapshot yet. Refresh to capture this market.",
    id: "+BP6ejutVt",
    description: "Overview has no cached provider snapshot",
  },
  loadError: {
    defaultMessage: "We couldn’t load the Overview snapshot.",
    id: "sucqiW0wUM",
    description: "Overview load error",
  },
  providerDisclosure: {
    defaultMessage: "Estimated traffic is DataForSEO’s ETV estimate, captured on demand.",
    id: "g6Tru4ATTb",
    description: "DataForSEO ETV disclosure",
  },
  top10: {
    defaultMessage: "Top-10 rankings",
    id: "BGn+NvicLw",
    description: "Overview metric for top ten rankings",
  },
  columnPage: {
    defaultMessage: "Page",
    id: "GzdUfM35EF",
    description: "Overview page path column",
  },
  columnKeywords: {
    defaultMessage: "Keywords",
    id: "JNN3VfD4RF",
    description: "Overview page keyword count column",
  },
  emptyKeywords: {
    defaultMessage: "No ranking keywords in this market yet.",
    id: "f8Qa8QmhOi",
    description: "Empty overview keywords",
  },
  emptyPages: {
    defaultMessage: "No ranking pages in this market yet.",
    id: "lL3u/hCPNt",
    description: "Empty overview pages",
  },
});
