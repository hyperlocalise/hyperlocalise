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

/** Copy shared by every use case page. Page-specific copy lives in `stories/*.ts`. */
export const useCasePageMessages = defineMessages({
  // Use case names (navbar, footer, homepage, hero eyebrow, persona cards)
  localisationOperationsLabel: {
    defaultMessage: "Localisation operations",
    id: "Xvv0v3o6oN",
    description: "Name of the localisation-operations use case",
  },
  qualityAndGuidelinesLabel: {
    defaultMessage: "Quality and guidelines",
    id: "Q/Kiw1gbci",
    description: "Name of the quality-and-guidelines use case",
  },
  helpCenterLocalisationLabel: {
    defaultMessage: "Help center localisation",
    id: "Mw591341oS",
    description: "Name of the help-center-localisation use case",
  },
  marketEntryLabel: {
    defaultMessage: "Market entry",
    id: "PHcioyVED1",
    description: "Name of the market-entry use case",
  },
  globalCampaignsLabel: {
    defaultMessage: "Global campaigns",
    id: "D1QDB1KyeZ",
    description: "Name of the global-campaigns use case",
  },
  marketExperimentsLabel: {
    defaultMessage: "Market experiments",
    id: "vpALlIb5lr",
    description: "Name of the market-experimentation use case",
  },
  pullRequestLocalisationLabel: {
    defaultMessage: "Pull request localisation",
    id: "A5nEPUdqlo",
    description: "Name of the pull-request localisation use case for developers",
  },
  cliAndApiLabel: {
    defaultMessage: "CLI and API",
    id: "LLZ17NJQ8A",
    description: "Name of the CLI and API use case for developers",
  },
  aiCodingAgentsLabel: {
    defaultMessage: "AI coding agents",
    id: "JXyICX5buY",
    description: "Name of the AI coding agents (MCP) use case for developers",
  },

  // Section eyebrows and shared UI
  ctaRequestDemo: {
    defaultMessage: "Request a demo",
    id: "r1sh7IHHwK",
    description: "Use case page request demo CTA",
  },
  shiftSectionLabel: {
    defaultMessage: "The shift",
    id: "+jfco4wSwJ",
    description: "Eyebrow for the before-and-after section on use case pages",
  },
  shiftBeforeLabel: {
    defaultMessage: "Today",
    id: "+xwA47ANoD",
    description: "Column heading for how work happens before Hyperlocalise",
  },
  shiftAfterLabel: {
    defaultMessage: "With Hyperlocalise",
    id: "7XbiZ5DXrd",
    description: "Column heading for how work happens with Hyperlocalise",
  },
  guideSectionLabel: {
    defaultMessage: "How it works",
    id: "89Uh1NtgtH",
    description: "Eyebrow for the step-by-step guide on use case pages",
  },
  guideStepLabel: {
    defaultMessage: "Step {number}",
    id: "SGmQWe0ZkK",
    description: "Label for one step of the guide. {number} is the step number.",
  },
  guidePause: {
    defaultMessage: "Pause walkthrough",
    id: "cVStyh2pK7",
    description: "Accessible label to pause the autoplaying guide",
  },
  guidePlay: {
    defaultMessage: "Play walkthrough",
    id: "R4SfthnnkM",
    description: "Accessible label to resume the autoplaying guide",
  },
  videoSectionLabel: {
    defaultMessage: "Watch",
    id: "7RS87zrk8d",
    description: "Eyebrow for the video section on use case pages",
  },
  videoSectionTitle: {
    defaultMessage: "See the platform in action",
    id: "6X53WIktqO",
    description: "Title for the product walkthrough video on use case pages",
  },
  videoSectionBody: {
    defaultMessage:
      "A short walkthrough of projects, review, automations, and agents working across markets.",
    id: "guEXclhPrh",
    description: "Description for the product walkthrough video on use case pages",
  },
  videoIrisTitle: {
    defaultMessage: "Localise video creative, not just copy",
    id: "86BBeRHefZ",
    description: "Title for the Iris video on the global campaigns use case page",
  },
  videoIrisBody: {
    defaultMessage:
      "Iris adapts on-screen text, subtitles, and voice for each market, then checks every locale before you publish.",
    id: "YoXNaqtoVz",
    description: "Description for the Iris video on the global campaigns use case page",
  },
  videoPlay: {
    defaultMessage: "Play the product walkthrough",
    id: "QwdmCJl7Sx",
    description: "Accessible label for the play button on the product video",
  },
  videoFrameTitle: {
    defaultMessage: "Hyperlocalise product walkthrough",
    id: "ux9nHpTgrR",
    description: "Title attribute for the embedded product video",
  },
  integrationsSectionLabel: {
    defaultMessage: "Works with",
    id: "lp4UfPH566",
    description: "Eyebrow for the integrations row on use case pages",
  },
  capabilitiesSectionLabel: {
    defaultMessage: "Key capabilities",
    id: "52zIpuTAwP",
    description: "Eyebrow for the capabilities section on use case pages",
  },
  scenarioSectionLabel: {
    defaultMessage: "Example workflow",
    id: "oqYxa7H8HM",
    description: "Eyebrow for the example timeline on use case pages",
  },

  // Personas
  personaLocalisationManagerLabel: {
    defaultMessage: "For localisation managers",
    id: "S/YXM9SvOf",
    description: "Persona tag on use case pages for localisation managers",
  },
  personaGrowthLabel: {
    defaultMessage: "For international growth teams",
    id: "vkKPhM0fii",
    description: "Persona tag on use case pages for international growth teams",
  },
  personaDeveloperLabel: {
    defaultMessage: "For developers",
    id: "+Q/1sNZTZh",
    description: "Persona tag on use case pages for developers",
  },
  personaSectionLabel: {
    defaultMessage: "Built for your role",
    id: "ly6RyY/2Uy",
    description: "Eyebrow for the persona section on use case pages",
  },
  personaSectionTitle: {
    defaultMessage: "One platform for everyone who takes you global",
    id: "Wahdi1u7Ql",
    description: "Title for the persona section on use case pages",
  },
  personaSectionDescription: {
    defaultMessage:
      "Localisation managers run the programme, growth teams open new markets, and developers ship the code. Find the workflow that matches your job.",
    id: "iRSXECRcYZ",
    description: "Description for the persona section on use case pages",
  },
  personaLocalisationManagerName: {
    defaultMessage: "Localisation managers",
    id: "CiW9WTA2ph",
    description: "Persona card title for localisation managers",
  },
  personaLocalisationManagerDescription: {
    defaultMessage:
      "Run requests, reviewers, vendors, and quality from one place, with a clear view of every locale.",
    id: "x75xM3HY7a",
    description: "Persona card description for localisation managers",
  },
  personaGrowthName: {
    defaultMessage: "International growth",
    id: "mhLKo3k/92",
    description: "Persona card title for international growth teams",
  },
  personaGrowthDescription: {
    defaultMessage:
      "Pick the right markets, launch campaigns there, and test what wins, with your brand intact in every language.",
    id: "8vHDUNYsIw",
    description: "Persona card description for international growth teams",
  },
  personaDeveloperName: {
    defaultMessage: "Developers",
    id: "gVszVKQGZM",
    description: "Persona card title for developers",
  },
  personaDeveloperDescription: {
    defaultMessage:
      "Keep localisation in Git, CI, and your coding agent, so missing or broken strings never reach production.",
    id: "/4VMlEfV3Y",
    description: "Persona card description for developers",
  },
  personaCurrentPage: {
    defaultMessage: "You are here",
    id: "s12zqRCD4L",
    description: "Marks the use case page the visitor is currently viewing",
  },

  // Mock UI
  mockStatusDone: {
    defaultMessage: "Done",
    id: "Qkll8Cxiqh",
    description: "Status chip in a product mock: finished",
  },
  mockStatusRunning: {
    defaultMessage: "In progress",
    id: "BtZrGlsbu0",
    description: "Status chip in a product mock: running",
  },
  mockStatusWarn: {
    defaultMessage: "Needs review",
    id: "qecL6uCFgA",
    description: "Status chip in a product mock: needs a person to review",
  },
  mockStatusError: {
    defaultMessage: "Blocked",
    id: "OD5x7qw/7J",
    description: "Status chip in a product mock: blocked or failed",
  },
  mockStatusTodo: {
    defaultMessage: "Queued",
    id: "8OopIG2EBD",
    description: "Status chip in a product mock: waiting to start",
  },
  mockAgentName: {
    defaultMessage: "Hyperlocalise",
    id: "ChVj6uqZAF",
    description: "Name shown for the Hyperlocalise agent in chat and pull request mocks",
  },
  mockPrCommented: {
    defaultMessage: "commented just now",
    id: "zHc9A1bLFp",
    description: "Pull request mock: the bot commented a moment ago",
  },
  mockPrLocaleColumn: {
    defaultMessage: "Locale",
    id: "+2N82tkK3q",
    description: "Pull request mock: table column for the locale",
  },
  mockPrResultColumn: {
    defaultMessage: "Result",
    id: "pAt/6uhnDa",
    description: "Pull request mock: table column for the check result",
  },
  mockToolCall: {
    defaultMessage: "Tool call",
    id: "beHtGtlhz2",
    description: "Chat mock: label for an MCP tool call made by the agent",
  },
  mockPreviewLabel: {
    defaultMessage: "Illustrative product preview",
    id: "qrx7FTRCiP",
    description: "Accessible label for decorative product mocks on use case pages",
  },
});

export type UseCaseMessageKey = keyof typeof useCasePageMessages;
