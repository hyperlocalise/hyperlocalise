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

export const automationsMockMessages = defineMessages({
  eyebrow: {
    defaultMessage: "Agent Automations",
    id: "nPHyjk/RPM",
    description: "Automations mock UI eyebrow label",
  },
  headline: {
    defaultMessage: "Automate GTM, review, and research workflows",
    id: "EaT7nmsjT2",
    description: "Automations mock UI section heading",
  },
  botLabel: {
    defaultMessage: "Use Hyperlocalise Agent",
    id: "6CovsOk2Kn",
    description: "Automations mock UI terminal title bar label",
  },
  requestDemo: {
    defaultMessage: "Request a Demo",
    id: "06V6dOkQzU",
    description: "Automations mock UI call-to-action button",
  },

  useCaseGtmPublishingTitle: {
    defaultMessage: "GTM content publishing",
    id: "22+D8zh5+I",
    description: "Automations mock UI GTM content publishing use case title",
  },
  useCaseGtmPublishingDescription: {
    defaultMessage: "Publish localized campaigns and landing pages across markets",
    id: "LCZuQN14MY",
    description: "Automations mock UI GTM content publishing use case description",
  },
  useCaseAutoReviewTitle: {
    defaultMessage: "Localisation review",
    id: "cRykdemD86",
    description: "Automations mock UI localisation review use case title",
  },
  useCaseAutoReviewDescription: {
    defaultMessage: "Review pull requests on GitHub and post one sticky comment",
    id: "BzZ7RfYZdI",
    description: "Automations mock UI localisation review use case description",
  },
  useCaseKeywordResearchTitle: {
    defaultMessage: "Multilingual keyword research",
    id: "Wy1vE+UJqV",
    description: "Automations mock UI multilingual keyword research use case title",
  },
  useCaseKeywordResearchDescription: {
    defaultMessage: "Compare search demand and content gaps across locales",
    id: "MszSNYsOAF",
    description: "Automations mock UI multilingual keyword research use case description",
  },

  triggerGtmBriefApproved: {
    defaultMessage: "GTM brief approved · Q2 launch",
    id: "fq5dqebQ+i",
    description: "Automations mock UI trigger label for GTM content publishing",
  },
  triggerGithubPullRequest: {
    defaultMessage: "GitHub pull request opened",
    id: "/6wXYQGzwZ",
    description: "Automations mock UI trigger label for a GitHub pull request opening",
  },
  triggerKeywordResearchSchedule: {
    defaultMessage: "Scheduled run · 1st of month",
    id: "gh3szaohtI",
    description: "Automations mock UI trigger label for keyword research schedule",
  },

  toolCms: {
    defaultMessage: "CMS",
    id: "Zxvw5o8hCN",
    description: "Automations mock UI tool label",
  },
  toolSlack: {
    defaultMessage: "Slack",
    id: "SWV7AxBTg5",
    description: "Automations mock UI tool label",
  },
  toolTranslate: {
    defaultMessage: "Translate",
    id: "JZdvnbrCrK",
    description: "Automations mock UI tool label",
  },
  toolGitHub: {
    defaultMessage: "GitHub",
    id: "lsxAaZycti",
    description: "Automations mock UI tool label",
  },
  toolMentionReview: {
    defaultMessage: "@hyperlocalise review",
    id: "mNhu5W2AEy",
    description: "Automations mock UI tool label for the mention review command",
  },
  toolSearch: {
    defaultMessage: "Search",
    id: "Bzgz2WD+0h",
    description: "Automations mock UI tool label",
  },
  toolExport: {
    defaultMessage: "Export brief",
    id: "9he5ArvC5a",
    description: "Automations mock UI tool label",
  },

  stepGtm1: {
    defaultMessage: "Brief received · 4 markets, 12 assets",
    id: "O5AUx21Cqs",
    description: "Automations mock UI GTM publishing step 1",
  },
  stepGtm2: {
    defaultMessage: "Generating localized landing page drafts...",
    id: "vRzaf+T+4c",
    description: "Automations mock UI GTM publishing step 2",
  },
  stepGtm3: {
    defaultMessage: "FR and DE routed for review",
    id: "CjBhJGtOu7",
    description: "Automations mock UI GTM publishing step 3",
  },
  stepGtm4: {
    defaultMessage: "Published to staging · notified #gtm",
    id: "Rkonjwj/NH",
    description: "Automations mock UI GTM publishing step 4",
  },

  stepAutoReview1: {
    defaultMessage: "Pull request opened on checkout-fr",
    id: "ILNKwHSRC9",
    description: "Automations mock UI localisation review step 1",
  },
  stepAutoReview2: {
    defaultMessage: "Reading localisation diff...",
    id: "q2LrsHfEDQ",
    description: "Automations mock UI localisation review step 2",
  },
  stepAutoReview3: {
    defaultMessage: "Checked missing translations and placeholders",
    id: "a9xpifQQ4Q",
    description: "Automations mock UI localisation review step 3",
  },
  stepAutoReview4: {
    defaultMessage: "Posted sticky review comment",
    id: "gmpcqBlz7J",
    description: "Automations mock UI localisation review step 4",
  },

  stepKeyword1: {
    defaultMessage: "Pulling search volume for core product terms",
    id: "Ve+0mAQW0d",
    description: "Automations mock UI keyword research step 1",
  },
  stepKeyword2: {
    defaultMessage: "EN · FR · DE · JA demand compared",
    id: "OSUbc/2Yxx",
    description: "Automations mock UI keyword research step 2",
  },
  stepKeyword3: {
    defaultMessage: "12 high-intent gaps found in DE",
    id: "dpJb4JeW+k",
    description: "Automations mock UI keyword research step 3 — highlight",
  },
  stepKeyword4: {
    defaultMessage: "Keyword brief exported to content team",
    id: "WM/mPEZR5D",
    description: "Automations mock UI keyword research step 4",
  },
});

export type AutomationsMockMessageKey = keyof typeof automationsMockMessages;
