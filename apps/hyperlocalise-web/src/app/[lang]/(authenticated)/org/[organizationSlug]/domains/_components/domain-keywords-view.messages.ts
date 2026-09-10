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

export const domainKeywordsViewMessages = defineMessages({
  seedCta: {
    defaultMessage: "Seed keywords",
    id: "wq110jUHyr",
    description: "Open the seed keywords dialog",
  },
  seedTitle: {
    defaultMessage: "Seed keywords",
    id: "aJQZvwdXzn",
    description: "Seed keywords dialog title",
  },
  seedDescription: {
    defaultMessage: "Expand ideas from a query in this domain’s market.",
    id: "ciwH2j2J/2",
    description: "Seed keywords dialog description",
  },
  seedKeywordLabel: {
    defaultMessage: "Seed",
    id: "ehALlAgOmB",
    description: "Seed keyword field label",
  },
  seedKeywordPlaceholder: {
    defaultMessage: "traduction automatique",
    id: "PmPfVWTjmU",
    description: "Seed keyword placeholder",
  },
  seedMarketLabel: {
    defaultMessage: "Market",
    id: "LEmGTbo93A",
    description: "Market field on the seed keywords dialog",
  },
  seedSubmit: {
    defaultMessage: "Expand ideas",
    id: "3NyprC4I6O",
    description: "Submit seed keywords",
  },
  seedSuccess: {
    defaultMessage: "Ideas expanded for this market.",
    id: "Uq2h47XEsH",
    description: "Toast after seeding keywords",
  },
  columnKeyword: {
    defaultMessage: "Keyword",
    id: "rvznxHqIs8",
    description: "Keyword research column for the query",
  },
  columnVolume: {
    defaultMessage: "Volume",
    id: "RXclhblLSq",
    description: "Keyword research column for search volume",
  },
  columnKd: {
    defaultMessage: "KD",
    id: "0zbYiE/2Rj",
    description: "Keyword research column for keyword difficulty",
  },
  columnCpc: {
    defaultMessage: "CPC",
    id: "e8hZSFrKgI",
    description: "Keyword research column for cost per click",
  },
  columnIntent: {
    defaultMessage: "Intent",
    id: "UmJEDvN4kE",
    description: "Keyword research column for intent",
  },
  inspectSerp: {
    defaultMessage: "Inspect SERP",
    id: "lnpu+nisbE",
    description: "Open the SERP sheet for a keyword",
  },
  selectedCount: {
    defaultMessage: "{count, plural, one {# selected} other {# selected}}",
    id: "DukW+nZE9G",
    description: "Count of selected keyword ideas",
  },
  save: {
    defaultMessage: "Save",
    id: "RvIRC+2k01",
    description: "Save selected keyword ideas",
  },
  sendToRanks: {
    defaultMessage: "Send to rank tracking",
    id: "NlEBPcL/uy",
    description: "Send selected keywords to rank tracking",
  },
  saved: {
    defaultMessage: "Keywords saved to this domain.",
    id: "v2T0Wek8yI",
    description: "Toast after saving keywords",
  },
  sentToRanks: {
    defaultMessage: "Keywords sent to rank tracking.",
    id: "Y/+xOQi7sH",
    description: "Toast after sending keywords to ranks",
  },
  emptyTitle: {
    defaultMessage: "Seed a query to expand ideas",
    id: "G052FcCXn0",
    description: "Empty keyword research title",
  },
  emptyDescription: {
    defaultMessage: "Start from a phrase this market actually searches for.",
    id: "dDYz0HQlRX",
    description: "Empty keyword research description",
  },
  loading: {
    defaultMessage: "Loading keyword research…",
    id: "/wR0WQz4Yx",
    description: "Loading state for live keyword research",
  },
  serpLoading: {
    defaultMessage: "Loading live SERP results…",
    id: "g9Z7QKCbkk",
    description: "Loading state while fetching a live SERP snapshot",
  },
  serpTitle: {
    defaultMessage: "SERP · {keyword}",
    id: "+FX267AAXq",
    description: "SERP sheet title",
  },
  serpDescription: {
    defaultMessage: "Live Google results in {market}. Your domain is highlighted when it appears.",
    id: "LSs2GWeMba",
    description: "SERP sheet description",
  },
  ownResult: {
    defaultMessage: "Your domain",
    id: "qBA6a2d2LM",
    description: "Badge on the workspace domain’s SERP row",
  },
  serpEmpty: {
    defaultMessage: "No SERP snapshot for this keyword yet.",
    id: "NMo/Dkl5Sm",
    description: "Empty SERP sheet body",
  },
  selectKeyword: {
    defaultMessage: "Select {keyword}",
    id: "WUx/Brx1Q5",
    description: "Accessible label for selecting a keyword idea",
  },
  seedError: {
    defaultMessage: "Could not expand ideas for this market.",
    id: "PQOjJOrlAv",
    description: "Error toast when seed expansion fails",
  },
  saveError: {
    defaultMessage: "Could not save the selected keywords.",
    id: "SCGXq3oGQR",
    description: "Error toast when saving keywords fails",
  },
  serpError: {
    defaultMessage: "Could not load a live SERP for this keyword.",
    id: "SeT4t9aRFg",
    description: "Error toast when live SERP fetch fails",
  },
  ranksError: {
    defaultMessage: "Could not send keywords to rank tracking.",
    id: "Imew7qccLy",
    description: "Error toast when sending keywords to ranks fails",
  },
});
