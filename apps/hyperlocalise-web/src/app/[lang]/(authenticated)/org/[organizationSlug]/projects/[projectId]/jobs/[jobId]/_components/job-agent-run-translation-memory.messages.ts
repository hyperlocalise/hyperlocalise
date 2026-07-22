"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const jobAgentRunTranslationMemoryMessages = defineMessages({
  tmMatchTitleWithScore: {
    defaultMessage: "{memoryName} · {sourceText} → {targetText} ({matchScore}%)",
    id: "yv/YEtTrPC",
    description: "Tooltip title for a TM match badge that includes a match score",
  },
  tmMatchTitle: {
    defaultMessage: "{memoryName} · {sourceText} → {targetText}",
    id: "acDZHLMCP3",
    description: "Tooltip title for a TM match badge without a match score",
  },
  tmBadgeLabelWithScore: {
    defaultMessage: "{source} · {memoryName} · {matchScore}%",
    id: "gWx5l7VSDf",
    description: "Badge label for a TM match that includes a match score",
  },
  tmBadgeLabel: {
    defaultMessage: "{source} · {memoryName}",
    id: "+IioXi9AED",
    description: "Badge label for a TM match without a match score",
  },
  translationMemoryUsed: {
    defaultMessage: "Translation memory used",
    id: "vH/Yb/E0OH",
    description: "Heading above detailed TM matches on an agent proposal",
  },
  matchScorePercent: {
    defaultMessage: "{matchScore}% match",
    id: "VCwqO4O4KD",
    description: "Match score badge text for a translation memory hit",
  },
  tmTextPair: {
    defaultMessage: "{sourceText} → {targetText}",
    id: "vZNYE6T8+g",
    description: "Source and target text pair for a TM match detail row",
  },
});
