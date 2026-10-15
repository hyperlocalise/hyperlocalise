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

export const localisationQualityMonitoringFaqCopy: UseCaseFaqSectionCopy = {
  heading: {
    defaultMessage: "A few things\nyou might ask.",
    id: "qMfaqHd001",
    description: "FAQ heading on the localisation-quality-monitoring use case page",
  },
  subheading: {
    defaultMessage: "Catch drift before customers do.",
    id: "qMfaqSub01",
    description: "FAQ subheading on the localisation-quality-monitoring use case page",
  },
};

export const localisationQualityMonitoringFaqItems: UseCaseFaqDescriptor[] = [
  faqPair(
    "What does Hyperlocalise monitor across product, marketing, and support content?",
    "qMfaqQ001",
    "Quality monitoring FAQ about content types",
    "Locale coverage, glossary compliance, source-to-target drift, and review status are tracked across strings, pages, and articles so quality is visible in one place—not three spreadsheets.",
    "qMfaqA001",
    "Quality monitoring FAQ answer about content types",
  ),
  faqPair(
    "Can we run regression checks before translations sync to production?",
    "qMfaqQ002",
    "Quality monitoring FAQ about regression checks",
    "Yes. New translations are compared to approved baselines. Failed checks block sync until reviewers resolve flagged strings.",
    "qMfaqA002",
    "Quality monitoring FAQ answer about regression checks",
  ),
  faqPair(
    "How does terminology drift get detected?",
    "qMfaqQ003",
    "Quality monitoring FAQ about terminology drift",
    "When product terms change or teams translate the same concept differently, Hyperlocalise flags glossary violations and inconsistent usage across content types.",
    "qMfaqA003",
    "Quality monitoring FAQ answer about terminology drift",
  ),
  faqPair(
    "Can quality results appear in GitHub pull requests?",
    "qMfaqQ004",
    "Quality monitoring FAQ about GitHub",
    "Localisation health can surface in pull requests so engineers see risks alongside code changes before release.",
    "qMfaqA004",
    "Quality monitoring FAQ answer about GitHub",
  ),
  faqPair(
    "Do we get alerts after content is already live?",
    "qMfaqQ005",
    "Quality monitoring FAQ about post-publish alerts",
    "Ongoing monitoring watches published content for drift, missing updates, and locale gaps after launch—not only at deploy time.",
    "qMfaqA005",
    "Quality monitoring FAQ answer about post-publish alerts",
  ),
  faqPair(
    "Does this replace our TMS or LQA vendor?",
    "qMfaqQ006",
    "Quality monitoring FAQ about TMS and LQA",
    "No. Hyperlocalise adds continuous quality intelligence across your stack. Your TMS and LQA partners still own vendor workflows; Hyperlocalise makes issues visible earlier.",
    "qMfaqA006",
    "Quality monitoring FAQ answer about TMS and LQA",
  ),
  faqPair(
    "Can we start monitoring on the Free plan?",
    "qMfaqQ007",
    "Quality monitoring FAQ about Free plan",
    "A Free workspace lets you connect sources, run pilot checks on a subset of content, and scale checks as your program matures.",
    "qMfaqA007",
    "Quality monitoring FAQ answer about Free plan",
  ),
  faqPair(
    "Who typically owns quality monitoring in Hyperlocalise?",
    "qMfaqQ008",
    "Quality monitoring FAQ about ownership",
    "Localisation operations and program managers run dashboards day to day; engineering and marketing leads consume signals in the tools they already use.",
    "qMfaqA008",
    "Quality monitoring FAQ answer about ownership",
  ),
];
