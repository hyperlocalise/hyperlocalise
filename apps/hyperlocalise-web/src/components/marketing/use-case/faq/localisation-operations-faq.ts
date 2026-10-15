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

export const localisationOperationsFaqCopy: UseCaseFaqSectionCopy = {
  heading: {
    defaultMessage: "A few things\nyou might ask.",
    id: "lOfaqHd001",
    description: "FAQ heading on the localisation-operations use case page",
  },
  subheading: {
    defaultMessage: "One operations layer across your stack.",
    id: "lOfaqSub01",
    description: "FAQ subheading on the localisation-operations use case page",
  },
};

export const localisationOperationsFaqItems: UseCaseFaqDescriptor[] = [
  faqPair(
    "What does an operations layer mean if we already have a TMS?",
    "lOfaqQ001",
    "Localisation operations FAQ about operations layer",
    "Hyperlocalise orchestrates context, review, and quality across product, marketing, and support workflows while your TMS remains the record for vendors and assets. Operations teams get visibility end to end.",
    "lOfaqA001",
    "Localisation operations FAQ answer about operations layer",
  ),
  faqPair(
    "Can we connect Crowdin, Phrase, or other TMS tools?",
    "lOfaqQ002",
    "Localisation operations FAQ about TMS integrations",
    "Yes. Hyperlocalise is TMS-agnostic and integrates with common translation systems so jobs, status, and sync stay aligned without duplicate manual entry.",
    "lOfaqA002",
    "Localisation operations FAQ answer about TMS integrations",
  ),
  faqPair(
    "How do AI agents fit into localisation operations?",
    "lOfaqQ003",
    "Localisation operations FAQ about AI agents",
    "Agents handle repeatable preparation—context gathering, drafting, and routing—while humans approve high-risk copy. Operations defines the guardrails and escalation paths.",
    "lOfaqA003",
    "Localisation operations FAQ answer about AI agents",
  ),
  faqPair(
    "Can program managers see status across every locale and content type?",
    "lOfaqQ004",
    "Localisation operations FAQ about status visibility",
    "Dashboards and activity logs show what is blocked, in review, or ready to ship across teams so nothing depends on a weekly status meeting.",
    "lOfaqA004",
    "Localisation operations FAQ answer about status visibility",
  ),
  faqPair(
    "How does Hyperlocalise help with vendor and reviewer coordination?",
    "lOfaqQ005",
    "Localisation operations FAQ about vendors",
    "Review assignments, SLAs, and audit trails live alongside source context so agencies and internal reviewers know exactly what changed and why.",
    "lOfaqA005",
    "Localisation operations FAQ answer about vendors",
  ),
  faqPair(
    "Will engineering teams need a separate localisation tool?",
    "lOfaqQ006",
    "Localisation operations FAQ about engineering",
    "Engineering keeps working in GitHub and CI. Hyperlocalise brings localisation signals into those workflows instead of asking developers to learn another UI.",
    "lOfaqA006",
    "Localisation operations FAQ answer about engineering",
  ),
  faqPair(
    "Can we pilot operations workflows on the Free plan?",
    "lOfaqQ007",
    "Localisation operations FAQ about Free plan",
    "Start a Free workspace to model handoffs, connect one TMS, and prove value with a single program before rolling out globally.",
    "lOfaqA007",
    "Localisation operations FAQ answer about Free plan",
  ),
  faqPair(
    "Who is this use case designed for?",
    "lOfaqQ008",
    "Localisation operations FAQ about audience",
    "Directors and managers running localization programs at SaaS and product-led companies who need scale without adding headcount for every new locale.",
    "lOfaqA008",
    "Localisation operations FAQ answer about audience",
  ),
];
