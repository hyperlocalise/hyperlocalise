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
import { faqPair } from "./faq-descriptor";
import type { UseCaseFaqDescriptor, UseCaseFaqSectionCopy } from "./use-case-faq-types";

export const marketingLocalisationFaqCopy: UseCaseFaqSectionCopy = {
  heading: {
    defaultMessage: "A few things\nyou might ask.",
    id: "mKfaqHd001",
    description: "FAQ heading on the marketing-localisation use case page",
  },
  subheading: {
    defaultMessage: "Campaign localisation without losing brand voice.",
    id: "mKfaqSub01",
    description: "FAQ subheading on the marketing-localisation use case page",
  },
};

export const marketingLocalisationFaqItems: UseCaseFaqDescriptor[] = [
  faqPair(
    "Can Hyperlocalise protect brand voice across marketing locales?",
    "mKfaqQ001",
    "Marketing localisation FAQ about brand voice",
    "Yes. Glossaries, tone guides, and campaign briefs are applied before drafts reach reviewers so adaptations respect positioning, legal disclaimers, and regional nuance—not word-for-word translation.",
    "mKfaqA001",
    "Marketing localisation FAQ answer about brand voice",
  ),
  faqPair(
    "Does it connect to our CMS and campaign tools?",
    "mKfaqQ002",
    "Marketing localisation FAQ about CMS and campaigns",
    "Approved copy can sync to CMS platforms, Webflow, and ad destinations you already use. Hyperlocalise orchestrates handoffs so marketing is not copying strings between systems.",
    "mKfaqA002",
    "Marketing localisation FAQ answer about CMS and campaigns",
  ),
  faqPair(
    "How do marketing, legal, and localisation reviewers work together?",
    "mKfaqQ003",
    "Marketing localisation FAQ about reviewers",
    "Multi-stakeholder approval flows route each locale through the right reviewers with audit trails. Everyone sees the same draft, comments, and status instead of email threads and version chaos.",
    "mKfaqA003",
    "Marketing localisation FAQ answer about reviewers",
  ),
  faqPair(
    "Can we pull context from Notion, Slack, or creative briefs?",
    "mKfaqQ004",
    "Marketing localisation FAQ about briefs",
    "Campaign intent, audience notes, and creative direction from the tools marketing already uses are structured for localisation so agents and linguists are not working from a file name alone.",
    "mKfaqA004",
    "Marketing localisation FAQ answer about briefs",
  ),
  faqPair(
    "Do we need to migrate off our current TMS?",
    "mKfaqQ005",
    "Marketing localisation FAQ about TMS",
    "No. Hyperlocalise is TMS-agnostic. It enriches the workflow with brand context and review orchestration while your TMS remains the system of record for assets and vendors.",
    "mKfaqA005",
    "Marketing localisation FAQ answer about TMS",
  ),
  faqPair(
    "Can we monitor live campaigns for messaging drift?",
    "mKfaqQ006",
    "Marketing localisation FAQ about drift",
    "After publish, Hyperlocalise can flag when live copy diverges from approved source messaging or glossary rules so teams fix drift before the next launch.",
    "mKfaqA006",
    "Marketing localisation FAQ answer about drift",
  ),
  faqPair(
    "Is there a self-serve way to try marketing localisation?",
    "mKfaqQ007",
    "Marketing localisation FAQ about Free plan",
    "Start a Free workspace to connect integrations, run a pilot campaign, and invite reviewers. Request a demo if you want a guided walkthrough of your stack.",
    "mKfaqA007",
    "Marketing localisation FAQ answer about Free plan",
  ),
  faqPair(
    "Which teams is this use case built for?",
    "mKfaqQ008",
    "Marketing localisation FAQ about teams",
    "Growth, brand, and regional marketing teams pair with localisation operations and agencies when they need faster launches without sacrificing voice or compliance.",
    "mKfaqA008",
    "Marketing localisation FAQ answer about teams",
  ),
];
