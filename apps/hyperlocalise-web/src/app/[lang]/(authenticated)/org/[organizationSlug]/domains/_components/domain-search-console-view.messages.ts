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
    id: "gScClk9m2Q",
    description: "Search Console clicks metric label",
  },
  impressions: {
    defaultMessage: "Impressions",
    id: "gScImp4n8R",
    description: "Search Console impressions metric label",
  },
  ctr: {
    defaultMessage: "CTR",
    id: "gScCtr7p1S",
    description: "Search Console click-through rate metric label",
  },
  position: {
    defaultMessage: "Position",
    id: "gScPos2q5T",
    description: "Search Console average position metric label",
  },
  dateRangeLabel: {
    defaultMessage: "Date range",
    id: "gScRng6u9V",
    description: "Search Console date range select label",
  },
  last7Days: {
    defaultMessage: "Last 7 days",
    id: "gScD7w3xY",
    description: "Search Console last 7 days range",
  },
  last28Days: {
    defaultMessage: "Last 28 days",
    id: "gScD28zA1",
    description: "Search Console last 28 days range",
  },
  last3Months: {
    defaultMessage: "Last 3 months",
    id: "gScD3mB2C",
    description: "Search Console last 3 months range",
  },
  last6Months: {
    defaultMessage: "Last 6 months",
    id: "gScD6mD3E",
    description: "Search Console last 6 months range",
  },
  last12Months: {
    defaultMessage: "Last 12 months",
    id: "gScD12F4G",
    description: "Search Console last 12 months range",
  },
  queriesTab: {
    defaultMessage: "Queries",
    id: "gScTabH5I",
    description: "Search Console queries tab",
  },
  pagesTab: {
    defaultMessage: "Pages",
    id: "gScTabJ6K",
    description: "Search Console pages tab",
  },
  columnQuery: {
    defaultMessage: "Query",
    id: "gScColL7M",
    description: "Search Console query column",
  },
  columnPage: {
    defaultMessage: "Page",
    id: "gScColN8O",
    description: "Search Console page column",
  },
  emptyQueries: {
    defaultMessage: "No Search Console queries in this range.",
    id: "gScEmpP9Q",
    description: "Empty Search Console queries table",
  },
  emptyPages: {
    defaultMessage: "No Search Console pages in this range.",
    id: "gScEmpR1S",
    description: "Empty Search Console pages table",
  },
  connectTitle: {
    defaultMessage: "Connect Search Console",
    id: "gScConT2U",
    description: "Empty state title when Search Console is disconnected",
  },
  connectDescription: {
    defaultMessage:
      "Import the clicks, impressions, and queries Google already recorded for this domain.",
    id: "gScConV3W",
    description: "Empty state description when Search Console is disconnected",
  },
  connectCta: {
    defaultMessage: "Connect Google",
    id: "gScConX4Y",
    description: "Connect Search Console OAuth button",
  },
  connectError: {
    defaultMessage: "Could not connect Search Console. Try again or use a different Google account.",
    id: "gScConY5Z",
    description: "Toast when Search Console OAuth fails",
  },
  unconfiguredTitle: {
    defaultMessage: "Search Console is not configured",
    id: "gScUncZ5A",
    description: "Empty state title when Google OAuth env is missing",
  },
  unconfiguredDescription: {
    defaultMessage: "Add Google OAuth credentials to connect Search Console for this workspace.",
    id: "gScUncB6C",
    description: "Empty state description when Google OAuth env is missing",
  },
  noPropertyTitle: {
    defaultMessage: "This domain is not in Search Console",
    id: "gScNoPD7E",
    description: "Empty state title when the connected account lacks this property",
  },
  noPropertyDescription: {
    defaultMessage:
      "{email} does not have a verified property for {domain}. Add it in Search Console, or connect a different Google account.",
    id: "gScNoPF8G",
    description: "Empty state description when the connected account lacks this property",
  },
  sampleData: {
    defaultMessage: "Sample Search Console data for this preview domain.",
    id: "gScSamH9I",
    description: "Disclosure for prototype Search Console metrics",
  },
  liveData: {
    defaultMessage: "Live Search Console data for {property}. Country filter follows this locale.",
    id: "gScLivJ1K",
    description: "Disclosure for live Search Console metrics",
  },
  connectedAs: {
    defaultMessage: "Connected as {email}",
    id: "gScAccL2M",
    description: "Connected Google account email",
  },
  disconnectCta: {
    defaultMessage: "Disconnect",
    id: "gScDisN3O",
    description: "Disconnect Search Console button",
  },
  disconnectSuccess: {
    defaultMessage: "Search Console disconnected.",
    id: "gScDisP4Q",
    description: "Toast after disconnecting Search Console",
  },
  disconnectError: {
    defaultMessage: "Could not disconnect Search Console.",
    id: "gScDisR5S",
    description: "Toast when Search Console disconnect fails",
  },
  loadError: {
    defaultMessage: "Could not load Search Console data.",
    id: "gScErrT6U",
    description: "Error state when Search Console performance fails",
  },
  inspectHeading: {
    defaultMessage: "Inspect URL",
    id: "gScInsV7W",
    description: "Search Console URL inspection heading",
  },
  inspectDescription: {
    defaultMessage: "Check how Google last crawled a page on this property.",
    id: "gScInsX8Y",
    description: "Search Console URL inspection description",
  },
  inspectLabel: {
    defaultMessage: "Page URL",
    id: "gScInsZ9A",
    description: "Search Console URL inspection input label",
  },
  inspectCta: {
    defaultMessage: "Inspect",
    id: "gScInsB1C",
    description: "Search Console URL inspection submit button",
  },
  inspectError: {
    defaultMessage: "Could not inspect this URL.",
    id: "gScInsD2E",
    description: "Toast when URL inspection fails",
  },
  inspectVerdict: {
    defaultMessage: "Verdict",
    id: "gScInsF3G",
    description: "URL inspection verdict label",
  },
  inspectCoverage: {
    defaultMessage: "Coverage",
    id: "gScInsH4I",
    description: "URL inspection coverage label",
  },
  inspectIndexing: {
    defaultMessage: "Indexing",
    id: "gScInsJ5K",
    description: "URL inspection indexing label",
  },
  inspectCrawl: {
    defaultMessage: "Last crawl",
    id: "gScInsL6M",
    description: "URL inspection last crawl label",
  },
  inspectCanonical: {
    defaultMessage: "Google canonical",
    id: "gScInsN7O",
    description: "URL inspection Google canonical label",
  },
  inspectOpen: {
    defaultMessage: "Open in Search Console",
    id: "gScInsP8Q",
    description: "Link to the Google Search Console inspection result",
  },
  loading: {
    defaultMessage: "Loading Search Console…",
    id: "gScLodR9S",
    description: "Loading state for Search Console performance",
  },
});
