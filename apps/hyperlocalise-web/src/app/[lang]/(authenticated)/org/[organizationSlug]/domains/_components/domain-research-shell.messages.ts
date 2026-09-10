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

export const domainResearchShellMessages = defineMessages({
  localeLabel: {
    defaultMessage: "Research locale",
    id: "M7q1LgOgRx",
    description: "Shared locale selector label",
  },
  editLocales: {
    defaultMessage: "Edit locales",
    id: "D6IBUTnPaw",
    description: "Manage domain locales from research",
  },
  localeScope: {
    defaultMessage: "Applies to every research tab.",
    id: "yWOL2/uNay",
    description: "Research locale scope help",
  },
  localeEmptyTitle: {
    defaultMessage: "No research for this locale yet",
    id: "HaSJjDRAg0",
    description: "Missing locale research title",
  },
  localeEmptyDescription: {
    defaultMessage:
      "There is no preview research for {locale}. Choose another locale to explore available data.",
    id: "Zln5rf1e7d",
    description: "Missing locale research explanation",
  },
  navKeywords: {
    defaultMessage: "Keyword research",
    id: "8Gk5dEdlLz",
    description: "Domain research navigation label",
  },
  navOverview: {
    defaultMessage: "Overview",
    id: "oG1OMIsUb2",
    description: "Domain research tab for domain overview",
  },
  navRanks: {
    defaultMessage: "Rank tracking",
    id: "dq6M0aso45",
    description: "Domain research navigation label",
  },
  navBrand: {
    defaultMessage: "AI visibility",
    id: "3CBfdb8CgM",
    description: "Domain research navigation label",
  },
  navPrompts: {
    defaultMessage: "Prompt explorer",
    id: "gtgCwprydq",
    description: "Domain research navigation label",
  },
  shellDescription: {
    defaultMessage:
      "{count, plural, one {# locale configured} other {# locales configured}}. Verification applies to the whole domain.",
    id: "4+P6YOB0GC",
    description: "Domain research header description",
  },
  sectionLabel: {
    defaultMessage: "Domains",
    id: "szhXuo8hoK",
    description: "Section label above a domain research heading",
  },
  loading: {
    defaultMessage: "Loading domain research…",
    id: "x0FiVbjynu",
    description: "Loading state for a live linked domain research page",
  },
  loadError: {
    defaultMessage: "Could not load domain research.",
    id: "mJWxbqwGL6",
    description: "Error state when live domain research fails to load",
  },
});
