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
import {
  buildHomepageFaqJsonLd,
  type HomepageFaqItem,
} from "@/components/marketing/homepage-faq-content";
import { getIntlShape } from "@/lib/app-i18n/intl";

export type PricingFaqItem = HomepageFaqItem;

export function getPricingFaqItems(locale: string): PricingFaqItem[] {
  const intl = getIntlShape(locale);

  return [
    {
      question: intl.formatMessage({
        defaultMessage: "Can I create an account today?",
        id: "aGyTnZ8Dnd",
        description: "Pricing FAQ question about account creation availability",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Not yet. Self-serve signup is coming soon. Request a demo if you want early access or need Enterprise.",
        id: "YxQp9bMkby",
        description: "Pricing FAQ answer about account creation availability",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "What is included in Free?",
        id: "5YNLAD74Wg",
        description: "Pricing FAQ question about Free plan limits",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Free includes 1 project, 1 seat, and 2 integrations so you can evaluate the workspace. Paid usage quotas start on Starter and Growth.",
        id: "boIAKxOC7q",
        description: "Pricing FAQ answer about Free plan limits",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Who should choose Starter vs Growth?",
        id: "RMs2g4acgN",
        description: "Pricing FAQ question comparing Starter and Growth",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Starter suits small teams that need more seats and unlimited projects. Growth adds higher agent, token, and automation limits plus unlimited translation jobs for production localisation workflows.",
        id: "IbjMoz30p/",
        description: "Pricing FAQ answer comparing Starter and Growth",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "When do I need Enterprise?",
        id: "mRvhPlspGD",
        description: "Pricing FAQ question about Enterprise fit",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Choose Enterprise when you need custom limits, SSO, a service-level agreement, dedicated support, or help with security reviews. Book a demo and we will scope the workspace with you.",
        id: "xp0uIyHTq6",
        description: "Pricing FAQ answer about Enterprise fit",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Are prices billed monthly?",
        id: "cT5B3xRjNb",
        description: "Pricing FAQ question about billing cadence",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Listed Starter and Growth prices are monthly. Enterprise pricing is custom and agreed during the demo. Final billing terms will be confirmed when self-serve checkout opens.",
        id: "Yol/WQATQ6",
        description: "Pricing FAQ answer about billing cadence",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Can I change plans later?",
        id: "+R091fatkR",
        description: "Pricing FAQ question about changing plans",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Yes. Once billing is available you will be able to move between plans as your usage grows. Enterprise changes are handled with your account contact.",
        id: "k8esVDxjx3",
        description: "Pricing FAQ answer about changing plans",
      }),
    },
  ];
}

export const buildPricingFaqJsonLd = buildHomepageFaqJsonLd;
