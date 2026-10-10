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
import type { HomepageFaqItem } from "@/components/marketing/homepage-faq-content";
import { getIntlShape } from "@/lib/app-i18n/intl";

import { faqPair } from "@/components/marketing/use-case/faq/faq-descriptor";
import type { UseCaseFaqDescriptor } from "@/components/marketing/use-case/faq/use-case-faq-types";

const agentsAutomationFaqCopy = {
  heading: {
    defaultMessage: "A few things\nyou might ask.",
    id: "aAfaqHd001",
    description: "FAQ heading on the Automation Workflow product page",
  },
  subheading: {
    defaultMessage: "Orchestrating multilingual content operations.",
    id: "aAfaqSub01",
    description: "FAQ subheading on the Automation Workflow product page",
  },
};

const agentsAutomationFaqDescriptors: UseCaseFaqDescriptor[] = [
  faqPair(
    "What is Automation Workflow in Hyperlocalise?",
    "aAfaqQ001",
    "Automation Workflow FAQ about product definition",
    "Automation Workflow connects tasks, AI agents, integrations, and human review into repeatable content operations—so localisation and publishing steps run the same way every time.",
    "aAfaqA001",
    "Automation Workflow FAQ answer about product definition",
  ),
  faqPair(
    "Can agents call our TMS, GitHub, Slack, and other tools?",
    "aAfaqQ002",
    "Automation Workflow FAQ about integrations",
    "Yes. Workflows use integrations and skills to read context, trigger jobs, notify reviewers, and write results back to the systems your team already relies on.",
    "aAfaqA002",
    "Automation Workflow FAQ answer about integrations",
  ),
  faqPair(
    "How do humans stay in control when agents run steps?",
    "aAfaqQ003",
    "Automation Workflow FAQ about human review",
    "You define approval gates, escalation paths, and which steps require a person. Agents prepare work; reviewers sign off before anything ships.",
    "aAfaqA003",
    "Automation Workflow FAQ answer about human review",
  ),
  faqPair(
    "Do we need to replace our TMS to use automations?",
    "aAfaqQ004",
    "Automation Workflow FAQ about TMS",
    "No. Hyperlocalise orchestrates around your TMS and content tools. Automations move data and context between them without forcing a migration.",
    "aAfaqA004",
    "Automation Workflow FAQ answer about TMS",
  ),
  faqPair(
    "Can non-developers build and maintain workflows?",
    "aAfaqQ005",
    "Automation Workflow FAQ about builders",
    "Visual workflow editing lets localisation and content operations teams compose automations, while technical owners can extend behavior with agents and custom steps.",
    "aAfaqA005",
    "Automation Workflow FAQ answer about builders",
  ),
  faqPair(
    "What triggers can start a workflow?",
    "aAfaqQ006",
    "Automation Workflow FAQ about triggers",
    "Common triggers include repository events, scheduled jobs, manual runs, and integration signals—so the right workflow starts when content or code changes.",
    "aAfaqA006",
    "Automation Workflow FAQ answer about triggers",
  ),
  faqPair(
    "Can we try Automation Workflow on the Free plan?",
    "aAfaqQ007",
    "Automation Workflow FAQ about Free plan",
    "Start a Free workspace to build pilot workflows, connect a few integrations, and expand automation as your program grows.",
    "aAfaqA007",
    "Automation Workflow FAQ answer about Free plan",
  ),
  faqPair(
    "Who is Automation Workflow built for?",
    "aAfaqQ008",
    "Automation Workflow FAQ about audience",
    "Localisation operations, content ops, and engineering-adjacent program managers who need reliable handoffs across languages without scripting every release by hand.",
    "aAfaqA008",
    "Automation Workflow FAQ answer about audience",
  ),
];

function formatFaqItems(locale: string, descriptors: UseCaseFaqDescriptor[]): HomepageFaqItem[] {
  const intl = getIntlShape(locale);

  return descriptors.map((descriptor) => ({
    question: intl.formatMessage(descriptor.question),
    answer: intl.formatMessage(descriptor.answer),
  }));
}

export function getAgentsAutomationFaqItems(locale: string): HomepageFaqItem[] {
  return formatFaqItems(locale, agentsAutomationFaqDescriptors);
}

export function getAgentsAutomationFaqSectionCopy(locale: string): {
  heading: string;
  subheading: string;
} {
  const intl = getIntlShape(locale);

  return {
    heading: intl.formatMessage(agentsAutomationFaqCopy.heading),
    subheading: intl.formatMessage(agentsAutomationFaqCopy.subheading),
  };
}
