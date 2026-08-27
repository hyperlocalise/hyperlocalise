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

export const contentOpsMockStageMessages = defineMessages({
  activityLive: {
    defaultMessage: "Live",
    id: "CoPsLive01",
    description: "Live indicator label on the content ops activity feed",
  },

  tabTriage: {
    defaultMessage: "Triage open questions",
    id: "CoPsTab01",
    description: "Content ops mock tab label for issues triage",
  },
  tabCampaign: {
    defaultMessage: "Localize campaign copy",
    id: "CoPsTab02",
    description: "Content ops mock tab label for campaign localisation",
  },
  tabSeoBlog: {
    defaultMessage: "Publish localised SEO blogs",
    id: "CoPsTab03",
    description: "Content ops mock tab label for SEO blog publishing",
  },
  tabBrand: {
    defaultMessage: "Keep brand consistent",
    id: "CoPsTab04",
    description: "Content ops mock tab label for brand governance",
  },
  tabBriefToPublish: {
    defaultMessage: "Automate brief to publish",
    id: "CoPsTab05",
    description: "Content ops mock tab label for brief-to-publish workflow",
  },

  botLabel: {
    defaultMessage: "Use Hyperlocalise Agent",
    id: "CoPsBot01",
    description: "Agent terminal title in content ops mock",
  },

  triggerGtmBrief: {
    defaultMessage: "GTM brief approved · Q2 launch",
    id: "CoPsTrg01",
    description: "GTM trigger label in content ops campaign mock",
  },
  triggerSeoSchedule: {
    defaultMessage: "Scheduled run · 1st of month",
    id: "CoPsTrg02",
    description: "SEO schedule trigger label in content ops mock",
  },

  toolCms: {
    defaultMessage: "CMS",
    id: "CoPsTl001",
    description: "CMS tool chip in content ops terminal mock",
  },
  toolTranslate: {
    defaultMessage: "Translate",
    id: "CoPsTl002",
    description: "Translate tool chip in content ops terminal mock",
  },
  toolSlack: {
    defaultMessage: "Slack",
    id: "CoPsTl003",
    description: "Slack tool chip in content ops terminal mock",
  },
  toolSearch: {
    defaultMessage: "Search",
    id: "CoPsTl004",
    description: "Search tool chip in content ops terminal mock",
  },
  toolAhrefs: {
    defaultMessage: "Ahrefs",
    id: "CoPsTl005",
    description: "Ahrefs tool chip in content ops terminal mock",
  },

  stepGtm1: {
    defaultMessage: "Brief received · 4 markets, 12 assets",
    id: "CoPsGt001",
    description: "Campaign mock step 1",
  },
  stepGtm2: {
    defaultMessage: "Generating localized landing page drafts...",
    id: "CoPsGt002",
    description: "Campaign mock step 2",
  },
  stepGtm3: {
    defaultMessage: "FR and DE routed for review",
    id: "CoPsGt003",
    description: "Campaign mock step 3",
  },
  stepGtm4: {
    defaultMessage: "Published to staging · notified #gtm",
    id: "CoPsGt004",
    description: "Campaign mock step 4",
  },

  stepSeo1: {
    defaultMessage: "Pulling search volume for core product terms",
    id: "CoPsSe001",
    description: "SEO blog mock step 1",
  },
  stepSeo2: {
    defaultMessage: "EN · FR · DE · JA demand compared",
    id: "CoPsSe002",
    description: "SEO blog mock step 2",
  },
  stepSeo3: {
    defaultMessage: "12 high-intent gaps found in DE",
    id: "CoPsSe003",
    description: "SEO blog mock step 3",
  },
  stepSeo4: {
    defaultMessage: "Localised SEO draft · meta + H1 adapted",
    id: "CoPsSe004",
    description: "SEO blog mock step 4",
  },
  stepSeo5: {
    defaultMessage: "QA passed · draft written to CMS · #content notified",
    id: "CoPsSe005",
    description: "SEO blog mock step 5",
  },

  issuesTitle: {
    defaultMessage: "Issues · acme workspace",
    id: "CoPsIs001",
    description: "Issues panel title in content ops mock",
  },
  issuesSummary: {
    defaultMessage: "{open} open · {inProgress} in progress · {resolved} resolved",
    id: "CoPsIs002",
    description: "Issues summary line in content ops mock",
  },
  issueWeb2Title: {
    defaultMessage: "Translation mistake in checkout",
    id: "CoPsIs003",
    description: "Issue row title in content ops mock",
  },
  issueWeb2Detail: {
    defaultMessage: "Payment button label too long · checkout.json",
    id: "CoPsIs004",
    description: "Issue row detail in content ops mock",
  },
  issueMob1Title: {
    defaultMessage: "Glossary violation in onboarding",
    id: "CoPsIs005",
    description: "Issue row title in content ops mock",
  },
  issueMob1Detail: {
    defaultMessage: "Product name should stay untranslated",
    id: "CoPsIs006",
    description: "Issue row detail in content ops mock",
  },
  issueWeb3Title: {
    defaultMessage: "QA failure on hero headline",
    id: "CoPsIs007",
    description: "Issue row title in content ops mock",
  },
  issueWeb3Detail: {
    defaultMessage: "Length check failed for German headline",
    id: "CoPsIs008",
    description: "Issue row detail in content ops mock",
  },
  statusOpen: {
    defaultMessage: "Open",
    id: "CoPsSt001",
    description: "Issue status open",
  },
  statusInProgress: {
    defaultMessage: "In progress",
    id: "CoPsSt002",
    description: "Issue status in progress",
  },
  statusResolved: {
    defaultMessage: "Resolved",
    id: "CoPsSt003",
    description: "Issue status resolved",
  },
  openInCat: {
    defaultMessage: "Open in CAT",
    id: "CoPsCat01",
    description: "Link label to open issue in CAT editor",
  },

  brandStyleTitle: {
    defaultMessage: "Brand voice · Style guide",
    id: "CoPsBr001",
    description: "Brand style guide panel title",
  },
  brandStyleSubtitle: {
    defaultMessage: "Applied while reviewing DE checkout CTA",
    id: "CoPsBr002",
    description: "Brand style guide panel subtitle",
  },
  brandRuleTone: {
    defaultMessage: "Tone: friendly, direct",
    id: "CoPsBr003",
    description: "Brand style rule chip",
  },
  brandRuleCta: {
    defaultMessage: "CTA: short verb",
    id: "CoPsBr004",
    description: "Brand style rule chip",
  },
  brandBeforeLabel: {
    defaultMessage: "Before",
    id: "CoPsBr005",
    description: "Before copy label in brand mock",
  },
  brandAfterLabel: {
    defaultMessage: "After",
    id: "CoPsBr006",
    description: "After copy label in brand mock",
  },
  brandBeforeCopy: {
    defaultMessage: "Nutzen Sie unsere innovative Plattform",
    id: "CoPsBr007",
    description: "Before copy sample in brand mock",
  },
  brandAfterCopy: {
    defaultMessage: "Jetzt starten",
    id: "CoPsBr008",
    description: "After copy sample in brand mock",
  },
  brandAppliedBadge: {
    defaultMessage: "Applied",
    id: "CoPsBr009",
    description: "Applied badge on brand style correction",
  },
  brandChatTitle: {
    defaultMessage: "Brand review chat",
    id: "CoPsBr010",
    description: "Brand chat dock title",
  },
  brandChatPrompt: {
    defaultMessage:
      "Does this German CTA follow our brand guidelines? \"Nutzen Sie unsere innovative Plattform\"",
    id: "CoPsBr011",
    description: "User prompt in brand chat mock",
  },
  brandToolName: {
    defaultMessage: "recall_knowledge_files",
    id: "CoPsBr012",
    description: "Tool name shown in brand chat mock",
  },
  brandToolDetail: {
    defaultMessage: "brand-voice-style-guide.pdf",
    id: "CoPsBr013",
    description: "Tool detail in brand chat mock",
  },
  brandVerdictLabel: {
    defaultMessage: "Verdict",
    id: "CoPsBr014",
    description: "Verdict section in brand chat answer",
  },
  brandVerdictBody: {
    defaultMessage: "Off-brand — too formal and jargon-heavy for DE checkout.",
    id: "CoPsBr015",
    description: "Verdict body in brand chat answer",
  },
  brandGuidelineLabel: {
    defaultMessage: "Guideline",
    id: "CoPsBr016",
    description: "Guideline section in brand chat answer",
  },
  brandGuidelineBody: {
    defaultMessage: "Tone: friendly, direct · CTA: short verb, max 24 characters.",
    id: "CoPsBr017",
    description: "Guideline body in brand chat answer",
  },
  brandSuggestLabel: {
    defaultMessage: "Suggested copy",
    id: "CoPsBr018",
    description: "Suggested copy section in brand chat answer",
  },
  brandSuggestBody: {
    defaultMessage: "Jetzt starten",
    id: "CoPsBr019",
    description: "Suggested copy body in brand chat answer",
  },
  brandSend: {
    defaultMessage: "Send",
    id: "CoPsBr020",
    description: "Send button in brand chat mock",
  },
  brandReplay: {
    defaultMessage: "Replay",
    id: "CoPsBr021",
    description: "Replay button in brand chat mock",
  },

  flowTitle: {
    defaultMessage: "Brief to publish · workflow",
    id: "CoPsFl001",
    description: "Flow panel title",
  },
  flowTemplateCampaign: {
    defaultMessage: "Campaign",
    id: "CoPsFl002",
    description: "Flow template pill for campaign",
  },
  flowTemplateSeo: {
    defaultMessage: "SEO blog",
    id: "CoPsFl003",
    description: "Flow template pill for SEO blog",
  },
  flowTemplateBrief: {
    defaultMessage: "Brief to publish",
    id: "CoPsFl004",
    description: "Flow template pill for brief to publish",
  },
  flowNodeBrief: {
    defaultMessage: "GTM brief",
    id: "CoPsFn001",
    description: "Flow node label",
  },
  flowNodeLocalise: {
    defaultMessage: "Localise",
    id: "CoPsFn002",
    description: "Flow node label",
  },
  flowNodeBrandQa: {
    defaultMessage: "Brand QA",
    id: "CoPsFn003",
    description: "Flow node label",
  },
  flowNodeReview: {
    defaultMessage: "Review",
    id: "CoPsFn004",
    description: "Flow node label",
  },
  flowNodeCms: {
    defaultMessage: "CMS publish",
    id: "CoPsFn005",
    description: "Flow node label",
  },
  flowNodeSchedule: {
    defaultMessage: "Scheduled run",
    id: "CoPsFn006",
    description: "Flow node label",
  },
  flowNodeKeywords: {
    defaultMessage: "Keyword research",
    id: "CoPsFn007",
    description: "Flow node label",
  },
  flowNodeDraft: {
    defaultMessage: "CMS draft",
    id: "CoPsFn008",
    description: "Flow node label",
  },
  flowNodeSlack: {
    defaultMessage: "Slack notify",
    id: "CoPsFn009",
    description: "Flow node label",
  },
  flowNodeStaging: {
    defaultMessage: "Staging",
    id: "CoPsFn010",
    description: "Flow node label",
  },
});

export type ContentOpsMockTabId =
  | "triage"
  | "campaign"
  | "seo-blog"
  | "brand"
  | "brief-to-publish";
