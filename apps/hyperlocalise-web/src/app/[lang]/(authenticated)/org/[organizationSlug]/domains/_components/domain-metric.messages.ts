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
export const domainMetricMessages = defineMessages({
  traffic: {
    defaultMessage: "Traffic",
    id: "pkYI4GF9b2",
    description: "Metric label for organic traffic",
  },
  keywords: {
    defaultMessage: "Keywords",
    id: "nl4dJqunip",
    description: "Metric label for ranking keywords",
  },
  tracked: {
    defaultMessage: "Tracked keywords",
    id: "TZz2MhGETq",
    description: "Metric label for tracked keywords",
  },
  aiMentions: {
    defaultMessage: "AI mentions",
    id: "1BzqC2Ot9h",
    description: "Metric label for AI mentions",
  },
  sampleData: {
    defaultMessage: "Sample data · Seven-day trends are illustrative.",
    id: "gO74VPwdhY",
    description: "Disclosure for prototype domain metrics",
  },
  liveData: {
    defaultMessage:
      "Live research via DataForSEO. Saved keywords and rank snapshots persist per market.",
    id: "OQDw2gWahR",
    description: "Disclosure for live domain research metrics",
  },
  noHistory: {
    defaultMessage: "No history yet",
    id: "k1XwyH9gj+",
    description: "Metric without enough historical observations",
  },
  unchanged: {
    defaultMessage: "No change",
    id: "68ZSvMDw6F",
    description: "Metric with the same first and last value",
  },
  increase: {
    defaultMessage: "Up {change}",
    id: "sILBQlQeXO",
    description: "Positive change in a domain metric",
  },
  decrease: {
    defaultMessage: "Down {change}",
    id: "V9ko0FO785",
    description: "Negative change in a domain metric",
  },
  period: {
    defaultMessage: "Last 7 days",
    id: "SnggsAqMA3",
    description: "Time range of metric sparkline",
  },
  comparison: {
    defaultMessage: "First to last day shown",
    id: "ORc/3Dzt9M",
    description: "Explanation of metric change baseline",
  },
  chartLabel: {
    defaultMessage: "{metric}: {trend}. Last 7 days.",
    id: "kYXziNyy/1",
    description: "Accessible summary of a domain metric chart",
  },
});
