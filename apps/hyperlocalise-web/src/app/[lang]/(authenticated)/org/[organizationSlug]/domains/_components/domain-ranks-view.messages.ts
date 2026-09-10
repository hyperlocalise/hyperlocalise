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

export const domainRanksViewMessages = defineMessages({
  addCta: {
    defaultMessage: "Add keywords",
    id: "MPyZMdy3Mn",
    description: "Open add keywords dialog on rank tracking",
  },
  addTitle: {
    defaultMessage: "Add keywords",
    id: "Pl1QYYtwq2",
    description: "Add keywords dialog title",
  },
  addDescription: {
    defaultMessage: "Track one query per line for this hostname and market.",
    id: "4TdFgYKUpH",
    description: "Add keywords dialog description",
  },
  addLabel: {
    defaultMessage: "Keywords",
    id: "9CS7SXDP/E",
    description: "Add keywords textarea label",
  },
  addPlaceholder: {
    defaultMessage: "traduction automatique",
    id: "MbFisZdAiR",
    description: "Add keywords textarea placeholder",
  },
  addSubmit: {
    defaultMessage: "Track keywords",
    id: "Cjmm2y/kv2",
    description: "Submit add keywords dialog",
  },
  addSuccess: {
    defaultMessage: "Keywords added to rank tracking.",
    id: "M/bA5ZKYrc",
    description: "Toast after adding rank-tracking keywords",
  },
  columnKeyword: {
    defaultMessage: "Keyword",
    id: "u0dyjBiqWo",
    description: "Rank tracking keyword column",
  },
  columnPosition: {
    defaultMessage: "Pos",
    id: "i9JekvPu3c",
    description: "Rank tracking position column",
  },
  columnChange: {
    defaultMessage: "Change",
    id: "EfvdjZ/lNf",
    description: "Rank tracking position change column",
  },
  columnUrl: {
    defaultMessage: "URL",
    id: "Sx94aDUTBX",
    description: "Rank tracking URL column",
  },
  columnVolume: {
    defaultMessage: "Volume",
    id: "MJXPKuSba6",
    description: "Rank tracking volume column",
  },
  emptyTitle: {
    defaultMessage: "No keywords tracked yet",
    id: "bbfynfwu7y",
    description: "Empty rank tracking title",
  },
  emptyDescription: {
    defaultMessage: "Add queries from keyword research, or paste them here.",
    id: "OETHn/tWgc",
    description: "Empty rank tracking description",
  },
  unranked: {
    defaultMessage: "—",
    id: "bnmPX9ah2A",
    description: "Shown when a tracked keyword has no position",
  },
  loading: {
    defaultMessage: "Loading rank tracking…",
    id: "rF5rankLd",
    description: "Loading state for live rank tracking",
  },
  refreshCta: {
    defaultMessage: "Refresh ranks",
    id: "rF5rankRef",
    description: "Re-check live SERP positions for tracked keywords",
  },
  refreshSuccess: {
    defaultMessage: "Rank positions updated from live SERPs.",
    id: "rF5rankOk",
    description: "Toast after a successful rank refresh",
  },
  refreshError: {
    defaultMessage: "Could not refresh rank positions.",
    id: "rF5rankErr",
    description: "Error toast when rank refresh fails",
  },
  addError: {
    defaultMessage: "Could not add keywords to rank tracking.",
    id: "aD3rankErr",
    description: "Error toast when adding tracked keywords fails",
  },
});
