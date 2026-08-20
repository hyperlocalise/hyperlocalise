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

export const knowledgeMockMessages = defineMessages({
  eyebrow: {
    defaultMessage: "Self-evolving Knowledge",
    id: "IyzX73LnS8",
    description: "Knowledge mock UI eyebrow label",
  },
  headline: {
    defaultMessage: "Every review makes the next one smarter",
    id: "DhOP2jRCDv",
    description: "Knowledge mock UI section heading",
  },
  requestDemo: {
    defaultMessage: "Request a Demo",
    id: "ApHeVsU19C",
    description: "Knowledge mock UI call-to-action button",
  },

  memoryLayerTitle: {
    defaultMessage: "Memory",
    id: "eSkuCuohea",
    description: "Knowledge mock UI memory panel header title",
  },
  updated: {
    defaultMessage: "Updated",
    id: "/5vEsukFts",
    description: "Knowledge mock UI flash badge shown when a new item is absorbed",
  },

  memoryItem0Title: {
    defaultMessage: "Onboarding CTA idioms vary by market",
    id: "7D/INu8qEd",
    description: "Knowledge mock UI memory feed item — glossary decision",
  },
  memoryItem1Title: {
    defaultMessage: "DE: avoid compound nouns longer than 3 parts",
    id: "bQQlZmLyEE",
    description: "Knowledge mock UI memory feed item — DE market rule",
  },
  memoryItem2Title: {
    defaultMessage: "FR error messages must use formal register",
    id: "8A31EeIxry",
    description: "Knowledge mock UI memory feed item — FR reviewer correction",
  },
  memoryItem3Title: {
    defaultMessage: 'JP: "Launch" → 「リリース」, not 「起動」',
    id: "0GwQ1TSnQ9",
    description: "Knowledge mock UI memory feed item — JP translation correction",
  },

  tagGlossary: {
    defaultMessage: "Glossary",
    id: "pv3y8oySTJ",
    description: "Knowledge mock UI memory item tag",
  },
  tagMarkets: {
    defaultMessage: "Markets",
    id: "3U55zi8ElG",
    description: "Knowledge mock UI memory item tag",
  },
  tagReviewers: {
    defaultMessage: "Reviewers",
    id: "MGTrrVsq/f",
    description: "Knowledge mock UI memory item tag",
  },
  tagTranslations: {
    defaultMessage: "Translations",
    id: "ZkrTBhWOCQ",
    description: "Knowledge mock UI memory item tag",
  },

  tsLastWeek: {
    defaultMessage: "Last week",
    id: "A+AR8GTHld",
    description: "Knowledge mock UI relative timestamp",
  },
  tsYesterday: {
    defaultMessage: "Yesterday",
    id: "4YSeGE7e6D",
    description: "Knowledge mock UI relative timestamp",
  },
  ts3hAgo: {
    defaultMessage: "3h ago",
    id: "m3woOgoczi",
    description: "Knowledge mock UI relative timestamp",
  },
  tsJustNow: {
    defaultMessage: "just now",
    id: "EdxsaRbtiw",
    description: "Knowledge mock UI relative timestamp",
  },

  stage1Title: {
    defaultMessage: "Approved work happens",
    id: "N1kyL8w8Vo",
    description: "Knowledge mock UI stage 1 title",
  },
  stage1Desc: {
    defaultMessage: "A translation is merged or a reviewer correction is accepted",
    id: "uR4u77DLza",
    description: "Knowledge mock UI stage 1 description",
  },
  stage2Title: {
    defaultMessage: "AI captures the signal",
    id: "I42jTEngJ1",
    description: "Knowledge mock UI stage 2 title",
  },
  stage2Desc: {
    defaultMessage: "The decision, correction, or preference is extracted",
    id: "y16oB+Jj83",
    description: "Knowledge mock UI stage 2 description",
  },
  stage3Title: {
    defaultMessage: "Knowledge stored",
    id: "khmp8meCYb",
    description: "Knowledge mock UI stage 3 title",
  },
  stage3Desc: {
    defaultMessage: "It joins the memory layer, tagged by type and market",
    id: "aUtNGn1QYX",
    description: "Knowledge mock UI stage 3 description",
  },
  stage4Title: {
    defaultMessage: "Next workflow starts smarter",
    id: "Dhz9gdqnZ4",
    description: "Knowledge mock UI stage 4 title",
  },
  stage4Desc: {
    defaultMessage: "Future jobs and agents draw from what was learned",
    id: "q3itCsc+YC",
    description: "Knowledge mock UI stage 4 description",
  },
});

export type KnowledgeMockMessageKey = keyof typeof knowledgeMockMessages;
