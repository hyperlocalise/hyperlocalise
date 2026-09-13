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

export const domainSearchConsoleViewMessages = defineMessages({
  clicks: {
    defaultMessage: "Clicks",
    id: "sbFxGzM9M2",
    description: "Search Console clicks metric label",
  },
  impressions: {
    defaultMessage: "Impressions",
    id: "UWdMJd14Mm",
    description: "Search Console impressions metric label",
  },
  ctr: {
    defaultMessage: "CTR",
    id: "V88J+lbuKL",
    description: "Search Console click-through rate metric label",
  },
  position: {
    defaultMessage: "Position",
    id: "2K/SIM6E9w",
    description: "Search Console average position metric label",
  },
  dateRangeLabel: {
    defaultMessage: "Date range",
    id: "joXjuV2TTv",
    description: "Search Console date range select label",
  },
  last7Days: {
    defaultMessage: "Last 7 days",
    id: "ov40auZmYC",
    description: "Search Console last 7 days range",
  },
  last28Days: {
    defaultMessage: "Last 28 days",
    id: "QYOU/SSUe4",
    description: "Search Console last 28 days range",
  },
  last3Months: {
    defaultMessage: "Last 3 months",
    id: "ve3WtEiiGs",
    description: "Search Console last 3 months range",
  },
  last6Months: {
    defaultMessage: "Last 6 months",
    id: "UK+ou5Ws9N",
    description: "Search Console last 6 months range",
  },
  last12Months: {
    defaultMessage: "Last 12 months",
    id: "lbKxuuE3UI",
    description: "Search Console last 12 months range",
  },
  queriesTab: {
    defaultMessage: "Queries",
    id: "sIHMlfgE+1",
    description: "Search Console queries tab",
  },
  pagesTab: {
    defaultMessage: "Pages",
    id: "CxILxvpPDu",
    description: "Search Console pages tab",
  },
  columnQuery: {
    defaultMessage: "Query",
    id: "thiBJ3ie8w",
    description: "Search Console query column",
  },
  columnPage: {
    defaultMessage: "Page",
    id: "OWqbmY/jNp",
    description: "Search Console page column",
  },
  emptyQueries: {
    defaultMessage: "No Search Console queries in this range.",
    id: "5iWVkPCngl",
    description: "Empty Search Console queries table",
  },
  emptyPages: {
    defaultMessage: "No Search Console pages in this range.",
    id: "3WK0Pdi+Cc",
    description: "Empty Search Console pages table",
  },
  connectTitle: {
    defaultMessage: "Connect Search Console",
    id: "vQWLTNVn0m",
    description: "Empty state title when Search Console is disconnected",
  },
  connectDescription: {
    defaultMessage:
      "Connect Google Search Console in Integrations to import the clicks, impressions, and queries Google already recorded for this domain.",
    id: "U99Hvv0Ste",
    description: "Empty state description when Search Console is disconnected",
  },
  connectCta: {
    defaultMessage: "Open Integrations",
    id: "1Ztae4/nmo",
    description: "Link to Integrations to connect Search Console through Pipes",
  },
  unconfiguredTitle: {
    defaultMessage: "Search Console is not available",
    id: "UR7H63F0D1",
    description: "Empty state title when WorkOS Pipes is unavailable",
  },
  unconfiguredDescription: {
    defaultMessage: "WorkOS is not configured, so Search Console cannot connect through Pipes.",
    id: "IATCAL7GZ3",
    description: "Empty state description when WorkOS Pipes is unavailable",
  },
  needsReauthTitle: {
    defaultMessage: "Reconnect Search Console",
    id: "uhGKdYNfmf",
    description: "Empty state title when the Search Console pipe needs reauthorization",
  },
  needsReauthDescription: {
    defaultMessage:
      "The Search Console connection needs to be authorized again. Reconnect it in Integrations, then return here.",
    id: "txV38L4Ccw",
    description: "Empty state description when the Search Console pipe needs reauthorization",
  },
  noPropertyTitle: {
    defaultMessage: "This domain is not in Search Console",
    id: "2hHDd0Jxxr",
    description: "Empty state title when the connected account lacks this property",
  },
  noPropertyDescription: {
    defaultMessage:
      "The connected Search Console account does not have a verified property for {domain}. Add it in Search Console, or reconnect a different Google account in Integrations.",
    id: "WT7ncP2dF4",
    description: "Empty state description when the connected account lacks this property",
  },
  sampleData: {
    defaultMessage: "Sample Search Console data for this preview domain.",
    id: "l6kzXhgr8a",
    description: "Disclosure for prototype Search Console metrics",
  },
  liveData: {
    defaultMessage: "Live Search Console data for {property}. Country filter follows this locale.",
    id: "jVMQIY999S",
    description: "Disclosure for live Search Console metrics",
  },
  connectedThroughIntegrations: {
    defaultMessage: "Connected through Integrations",
    id: "CPVePRU7tR",
    description: "Label when Search Console is connected through WorkOS Pipes",
  },
  manageCta: {
    defaultMessage: "Manage in Integrations",
    id: "wx5NVEjoyn",
    description: "Link to manage the Search Console pipe on the Integrations page",
  },
  loadError: {
    defaultMessage: "Could not load Search Console data.",
    id: "LCfqi9ecDG",
    description: "Error state when Search Console performance fails",
  },
  inspectHeading: {
    defaultMessage: "Inspect URL",
    id: "koqtXwMgDw",
    description: "Search Console URL inspection heading",
  },
  inspectDescription: {
    defaultMessage: "Check how Google last crawled a page on this property.",
    id: "qb5M/SMiFT",
    description: "Search Console URL inspection description",
  },
  inspectLabel: {
    defaultMessage: "Page URL",
    id: "E+GVWuHtit",
    description: "Search Console URL inspection input label",
  },
  inspectCta: {
    defaultMessage: "Inspect",
    id: "B4xkpzHiYJ",
    description: "Search Console URL inspection submit button",
  },
  inspectError: {
    defaultMessage: "Could not inspect this URL.",
    id: "yuuXlWLDOS",
    description: "Toast when URL inspection fails",
  },
  inspectVerdict: {
    defaultMessage: "Verdict",
    id: "D852bi6LKr",
    description: "URL inspection verdict label",
  },
  inspectCoverage: {
    defaultMessage: "Coverage",
    id: "pgj0hoaJ/o",
    description: "URL inspection coverage label",
  },
  inspectIndexing: {
    defaultMessage: "Indexing",
    id: "pQMEgwhvGA",
    description: "URL inspection indexing label",
  },
  inspectCrawl: {
    defaultMessage: "Last crawl",
    id: "00qb+AkuR9",
    description: "URL inspection last crawl label",
  },
  inspectCanonical: {
    defaultMessage: "Google canonical",
    id: "ER73k4zqPy",
    description: "URL inspection Google canonical label",
  },
  inspectOpen: {
    defaultMessage: "Open in Search Console",
    id: "t3TQLj1rWb",
    description: "Link to the Google Search Console inspection result",
  },
  loading: {
    defaultMessage: "Loading Search Console…",
    id: "w0w45ehfip",
    description: "Loading state for Search Console performance",
  },
});
