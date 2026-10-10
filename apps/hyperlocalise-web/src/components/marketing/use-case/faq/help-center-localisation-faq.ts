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

export const helpCenterLocalisationFaqCopy: UseCaseFaqSectionCopy = {
  heading: {
    defaultMessage: "A few things\nyou might ask.",
    id: "hCfaqHd001",
    description: "FAQ heading on the help-center-localisation use case page",
  },
  subheading: {
    defaultMessage: "Support content that stays accurate in every language.",
    id: "hCfaqSub01",
    description: "FAQ subheading on the help-center-localisation use case page",
  },
};

export const helpCenterLocalisationFaqItems: UseCaseFaqDescriptor[] = [
  faqPair(
    "Can Hyperlocalise localise help center articles from Zendesk?",
    "hCfaqQ001",
    "Help center localisation FAQ about Zendesk",
    "Yes. Connect Zendesk—or your existing knowledge base—to ingest articles, track locale coverage, and route updates when English source content changes. Approved translations sync back so customers see current guidance in every language.",
    "hCfaqA001",
    "Help center localisation FAQ answer about Zendesk",
  ),
  faqPair(
    "How do we keep support articles in sync when the English source changes?",
    "hCfaqQ002",
    "Help center localisation FAQ about source updates",
    "Hyperlocalise detects source changes, highlights affected locales, and queues re-translation or reviewer updates so outdated articles do not linger after a product release.",
    "hCfaqA002",
    "Help center localisation FAQ answer about source updates",
  ),
  faqPair(
    "Can support and localisation teams share one workflow?",
    "hCfaqQ003",
    "Help center localisation FAQ about collaboration",
    "Support leads, technical writers, and localisation reviewers work from shared status, comments, and audit history. Escalations route to the right expert without losing article context.",
    "hCfaqA003",
    "Help center localisation FAQ answer about collaboration",
  ),
  faqPair(
    "Does it work with other help desks besides Zendesk?",
    "hCfaqQ004",
    "Help center localisation FAQ about other help desks",
    "Zendesk is a common starting point, but the same workflow applies to other knowledge bases and CMS-backed help centers through integrations and structured imports.",
    "hCfaqA004",
    "Help center localisation FAQ answer about other help desks",
  ),
  faqPair(
    "How are terminology and product names kept consistent in support content?",
    "hCfaqQ005",
    "Help center localisation FAQ about terminology",
    "Product glossaries and do-not-translate rules apply to help articles the same way they apply to UI strings, reducing mixed terminology across docs and the product.",
    "hCfaqA005",
    "Help center localisation FAQ answer about terminology",
  ),
  faqPair(
    "Can we measure locale coverage for our knowledge base?",
    "hCfaqQ006",
    "Help center localisation FAQ about coverage",
    "Dashboards show which articles are complete, stale, or missing per locale so support leaders can prioritize updates before customers notice gaps.",
    "hCfaqA006",
    "Help center localisation FAQ answer about coverage",
  ),
  faqPair(
    "Can we start on the Free plan for help center localisation?",
    "hCfaqQ007",
    "Help center localisation FAQ about Free plan",
    "Yes. Spin up a Free workspace, connect your knowledge base, and pilot a subset of articles with your team before scaling to every locale.",
    "hCfaqA007",
    "Help center localisation FAQ answer about Free plan",
  ),
  faqPair(
    "Who usually runs help center localisation in Hyperlocalise?",
    "hCfaqQ008",
    "Help center localisation FAQ about ownership",
    "Customer education, support operations, and localisation program managers typically co-own the workflow—support defines accuracy requirements while localisation ensures quality at scale.",
    "hCfaqA008",
    "Help center localisation FAQ answer about ownership",
  ),
];
