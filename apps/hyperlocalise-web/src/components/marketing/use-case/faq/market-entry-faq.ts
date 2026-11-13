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
import type { IntlShape } from "@formatjs/intl";

import type { HomepageFaqItem } from "@/components/marketing/homepage-faq-content";

// Inline formatMessage() calls so the catalog extractor picks every string up.
export function formatMarketEntryFaq(intl: IntlShape): {
  heading: string;
  subheading: string;
  items: HomepageFaqItem[];
} {
  return {
    heading: intl.formatMessage({
      defaultMessage: "A few things\nyou might ask.",
      id: "PgR82rYXHf",
      description: "FAQ heading on the market-entry use case page",
    }),
    subheading: intl.formatMessage({
      defaultMessage: "Choosing and entering new markets with evidence.",
      id: "2vchm8ygZl",
      description: "FAQ subheading on the market-entry use case page",
    }),
    items: [
      {
        question: intl.formatMessage({
          defaultMessage: "What does the free localisation audit check?",
          id: "66D9jSl93I",
          description: "market-entry use case FAQ question 1",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "It scores a website for localisation, SEO, and AI answer readiness: hreflang setup, locale coverage, translated metadata, and structured content that AI engines can use. You can claim the domain from the audit report to keep researching it.",
          id: "V94a2u8bZl",
          description: "market-entry use case FAQ answer 1",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "How many markets can I research per domain?",
          id: "FAfSyfb9GR",
          description: "market-entry use case FAQ question 2",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Up to 16. A market is a language and location pair, such as Spanish in Mexico. Markets are separate from a project's target locales, so you can research a market before you translate for it.",
          id: "X54xx6BO3e",
          description: "market-entry use case FAQ answer 2",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Where does the search data come from?",
          id: "Po7H7VK5pX",
          description: "market-entry use case FAQ question 3",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Rankings, keywords, and estimated traffic come from third-party search data captured on demand. Estimated traffic is an estimate, not measured visits. Connect Search Console when you want real clicks.",
          id: "cFR/xF3v08",
          description: "market-entry use case FAQ answer 3",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Do I need to verify my domain?",
          id: "yhBthdWnU/",
          description: "market-entry use case FAQ question 4",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Yes, to research it. You can verify with a DNS TXT record, an HTML file, or a meta tag. A hostname can be verified by one organization at a time.",
          id: "EByZwhmMeP",
          description: "market-entry use case FAQ answer 4",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Can I see how AI assistants talk about us in a market?",
          id: "sUPmNhOfVD",
          description: "market-entry use case FAQ question 5",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Yes. AI visibility shows how AI engines describe and recommend your brand in each market, so you can track it alongside classic search rankings.",
          id: "1blE2PsDHD",
          description: "market-entry use case FAQ answer 5",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "How does research turn into content?",
          id: "ATInNdgcYG",
          description: "market-entry use case FAQ question 6",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Saved keywords belong to the domain and market. Use them to brief translation and new local content, so pages use the words people in that market actually search for.",
          id: "p/KcxIwaod",
          description: "market-entry use case FAQ answer 6",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Does this guarantee rankings?",
          id: "8cWNhjv7MR",
          description: "market-entry use case FAQ question 7",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "No. Research shows demand and where you stand today. Results depend on your content, competition, and search engines, and we never present research as a promise of future rankings.",
          id: "yJXuaDRVzj",
          description: "market-entry use case FAQ answer 7",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Who on the team uses this?",
          id: "VDTTe8irAm",
          description: "market-entry use case FAQ question 8",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Growth, SEO, and content marketers use it to choose markets and plan content. Localisation managers use the same research to prioritise what to translate first.",
          id: "vUcnTS5vzO",
          description: "market-entry use case FAQ answer 8",
        }),
      },
    ],
  };
}
