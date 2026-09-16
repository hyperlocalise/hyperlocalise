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

export const domainLinkDialogMessages = defineMessages({
  editTitle: {
    defaultMessage: "Edit locales",
    id: "K6HKJyJvL1",
    description: "Domain locale dialog title",
  },
  editDescription: {
    defaultMessage: "Choose the locales to research for this domain.",
    id: "NVI4PGUZDH",
    description: "Domain locale dialog description",
  },
  save: {
    defaultMessage: "Save locales",
    id: "L1dn3JIeHU",
    description: "Save supported domain locales",
  },
  saved: {
    defaultMessage: "Locales updated for this preview.",
    id: "BGjPXD5fgV",
    description: "Prototype locale save toast",
  },
  localesRequired: {
    defaultMessage: "Select at least one locale.",
    id: "wYyC/XZMmS",
    description: "Domain locale validation",
  },
  hostnameInvalid: {
    defaultMessage: "Enter a hostname such as shop.example.com, without a URL path.",
    id: "PYIsQFA2Np",
    description: "Invalid domain hostname",
  },
  hostnameDuplicate: {
    defaultMessage: "This domain is already linked. Edit its locales instead.",
    id: "Ck9MOHJiWV",
    description: "Duplicate domain validation",
  },
  prototypeNotice: {
    defaultMessage:
      "Preview only. Changes last until you reload and are not saved to your workspace.",
    id: "4HQ7im6sof",
    description: "Prototype domain persistence disclosure",
  },
  title: {
    defaultMessage: "Link domain",
    id: "2+oKbAvHmj",
    description: "Link domain dialog title",
  },
  description: {
    defaultMessage: "Choose the locales for this hostname. Verify the domain once for all locales.",
    id: "ed78rqC5km",
    description: "Link domain dialog description",
  },
  liveDescription: {
    defaultMessage:
      "Enter the hostname from your localisation audit. You will verify ownership on the next step.",
    id: "y7AjSFsGUH",
    description: "Link domain dialog description for the live claim flow",
  },
  hostnameLabel: {
    defaultMessage: "Hostname",
    id: "QzCT9StKW7",
    description: "Hostname field on the link domain dialog",
  },
  hostnamePlaceholder: {
    defaultMessage: "shop.example.com",
    id: "oV4/G//JgO",
    description: "Hostname placeholder on the link domain dialog",
  },
  marketLabel: {
    defaultMessage: "Locales",
    id: "vOplG6AhcP",
    description: "Market field on the link domain dialog",
  },
  primaryMarketLabel: {
    defaultMessage: "Choose a primary market",
    id: "wDhuLOW+W9",
    description: "Primary market step label in the link domain dialog",
  },
  additionalMarketLabel: {
    defaultMessage: "Add more markets",
    id: "x6yKWPVufv",
    description: "Additional markets step label in the link domain dialog",
  },
  primaryMarketDescription: {
    defaultMessage: "Start with the market you want to research first.",
    id: "TKAqLlsHeq",
    description: "Primary market step description in the link domain dialog",
  },
  additionalMarketDescription: {
    defaultMessage: "Add any other markets you want to track for this domain.",
    id: "SLUHC5sgtE",
    description: "Additional markets step description in the link domain dialog",
  },
  marketSearchLabel: {
    defaultMessage: "Search markets",
    id: "KtZqcEY+BH",
    description: "Accessible label for the domain market search field",
  },
  marketSearchPlaceholder: {
    defaultMessage: "Search by country or language",
    id: "Xh3DLGw+tI",
    description: "Placeholder for the domain market search field",
  },
  selectedMarkets: {
    defaultMessage: "{count, plural, one {# market selected} other {# markets selected}}",
    id: "Oile6DzTv1",
    description: "Summary of selected domain markets",
  },
  chooseAdditionalMarkets: {
    defaultMessage: "Add markets",
    id: "hRBR50v6LT",
    description: "Advance from primary market selection to additional markets",
  },
  back: {
    defaultMessage: "Back",
    id: "z3FugdwJo6",
    description: "Return to primary market selection",
  },
  submit: {
    defaultMessage: "Continue to verification",
    id: "lt5CygG2lb",
    description: "Submit the link domain dialog",
  },
  hostnameRequired: {
    defaultMessage: "Enter a hostname.",
    id: "tyAE2cKpjv",
    description: "Validation when the hostname is missing",
  },
  success: {
    defaultMessage: "Domain queued. Add the DNS record to finish linking.",
    id: "UF5RFmfnwB",
    description: "Toast after linking a domain in the prototype",
  },
  analyzeWebsite: {
    defaultMessage: "Analyze website",
    id: "dIFrzYiccb",
    description: "Analyze homepage for market suggestions",
  },
  analyzingWebsite: {
    defaultMessage: "Analyzing…",
    id: "48OOssSgDz",
    description: "Loading website market analysis",
  },
  refreshAnalysis: {
    defaultMessage: "Refresh analysis",
    id: "vyLgfxoR0o",
    description: "Refresh cached website market analysis",
  },
  analysisTitle: {
    defaultMessage: "Website snapshot",
    id: "9D2YcF7fSG",
    description: "Inline website analysis result heading",
  },
  analysisCached: {
    defaultMessage: "Recent analysis",
    id: "Xlgy9ede/k",
    description: "Cached website analysis indicator",
  },
  analysisSummary: {
    defaultMessage: "{category} · {confidence}% confidence",
    id: "WwYaNmorcw",
    description: "Website classification summary",
  },
  primarySuggestions: {
    defaultMessage: "Primary markets",
    id: "ouuudkrEgM",
    description: "Primary market suggestions heading",
  },
  potentialSuggestions: {
    defaultMessage: "Potential markets",
    id: "AoMNExCG66",
    description: "Potential market suggestions heading",
  },
  addSuggestion: {
    defaultMessage: "Add",
    id: "ThHxrIi0qv",
    description: "Add an AI market suggestion",
  },
  suggestionAdded: {
    defaultMessage: "Added",
    id: "TzJ78gxg1r",
    description: "Already-added AI market suggestion",
  },
  analysisUnavailable: {
    defaultMessage: "We couldn’t analyze this website. You can choose markets manually.",
    id: "yHlFa8uDIu",
    description: "Non-blocking website analysis error",
  },
  noMarketsContinue: {
    defaultMessage: "Continue without markets",
    id: "7Q6qJvxxKK",
    description: "Continue onboarding without selecting markets",
  },
  projectLabel: {
    defaultMessage: "Project",
    id: "ItiHaN5/Dd",
    description: "Project field on the link domain dialog",
  },
  projectDescription: {
    defaultMessage: "Choose where this domain should be attached after verification.",
    id: "OibCQ9KDFv",
    description: "Project selection guidance on the link domain dialog",
  },
  createProject: {
    defaultMessage: "Create new project",
    id: "HgrL50FsMJ",
    description: "Create a project after domain verification",
  },
  existingProject: {
    defaultMessage: "Use existing project",
    id: "fDq4pExBJ3",
    description: "Attach the domain to an existing project",
  },
  unassignedProject: {
    defaultMessage: "Leave unassigned",
    id: "OI2cdohCkE",
    description: "Verify a domain without attaching a project",
  },
  projectSelectPlaceholder: {
    defaultMessage: "Select a project",
    id: "+EpQ6jzmQC",
    description: "Placeholder for the existing project selector",
  },
  projectsLoading: {
    defaultMessage: "Loading projects…",
    id: "9GJFHnphCc",
    description: "Loading state for existing projects",
  },
  projectRequired: {
    defaultMessage: "Select a project or choose another project option.",
    id: "tSPHzkEI0Y",
    description: "Validation when existing project selection is incomplete",
  },
});
