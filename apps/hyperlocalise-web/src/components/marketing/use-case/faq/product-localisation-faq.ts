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

export const productLocalisationFaqCopy: UseCaseFaqSectionCopy = {
  heading: {
    defaultMessage: "A few things\nyou might ask.",
    id: "pLfaqHd001",
    description: "FAQ heading on the product-localisation use case page",
  },
  subheading: {
    defaultMessage: "Shipping product copy in every locale.",
    id: "pLfaqSub01",
    description: "FAQ subheading on the product-localisation use case page",
  },
};

export const productLocalisationFaqItems: UseCaseFaqDescriptor[] = [
  faqPair(
    "Do we have to replace our TMS to use Hyperlocalise for product strings?",
    "pLfaqQ001",
    "Product localisation FAQ about TMS replacement",
    "No. Hyperlocalise sits alongside your TMS and developer workflow. It ingests context from GitHub, briefs, and glossaries, prepares reviewed translations, and syncs results back to the system you already use as the record of truth.",
    "pLfaqA001",
    "Product localisation FAQ answer about TMS replacement",
  ),
  faqPair(
    "Can Hyperlocalise localise UI copy from GitHub pull requests?",
    "pLfaqQ002",
    "Product localisation FAQ about GitHub pull requests",
    "Yes. Connect your repositories so string changes in pull requests trigger localisation workflows, reviewer routing, and quality checks before translations merge with your release branch.",
    "pLfaqA002",
    "Product localisation FAQ answer about GitHub pull requests",
  ),
  faqPair(
    "How does human review work for product translations?",
    "pLfaqQ003",
    "Product localisation FAQ about human review",
    "Drafts can be routed to in-house reviewers, linguists, or agency partners with clear status per locale. Reviewers see source context, glossary matches, and change history instead of isolated strings in a spreadsheet.",
    "pLfaqA003",
    "Product localisation FAQ answer about human review",
  ),
  faqPair(
    "Will this fit our existing CI/CD and release process?",
    "pLfaqQ004",
    "Product localisation FAQ about CI/CD",
    "Hyperlocalise is built for continuous delivery. You can gate releases on locale coverage, block sync when quality thresholds fail, and surface localisation health in the same pull requests engineering already reviews.",
    "pLfaqA004",
    "Product localisation FAQ answer about CI/CD",
  ),
  faqPair(
    "How are product terminology and glossaries enforced?",
    "pLfaqQ005",
    "Product localisation FAQ about glossaries",
    "Approved terms, do-not-translate rules, and tone guidance travel with each job. The platform flags glossary violations and terminology drift before strings reach production.",
    "pLfaqA005",
    "Product localisation FAQ answer about glossaries",
  ),
  faqPair(
    "What sources besides GitHub can feed product localisation?",
    "pLfaqQ006",
    "Product localisation FAQ about sources",
    "Teams connect briefs and specs from Notion, Slack, Figma, and other tools so translators and agents see product intent—not just raw keys. Structured imports and API access cover the rest of your content pipeline.",
    "pLfaqA006",
    "Product localisation FAQ answer about sources",
  ),
  faqPair(
    "Can we start on the Free plan for product localisation?",
    "pLfaqQ007",
    "Product localisation FAQ about Free plan",
    "Yes. Create a Free workspace to explore workflows, connect integrations, and run pilots with your team. Upgrade when you need more seats, locales, or automation volume.",
    "pLfaqA007",
    "Product localisation FAQ answer about Free plan",
  ),
  faqPair(
    "Who typically owns this workflow on the customer side?",
    "pLfaqQ008",
    "Product localisation FAQ about ownership",
    "Product and engineering teams usually sponsor the integration, while localisation operations or program managers run day-to-day review and release coordination. Hyperlocalise gives each group a shared view of status and risk.",
    "pLfaqA008",
    "Product localisation FAQ answer about ownership",
  ),
];
