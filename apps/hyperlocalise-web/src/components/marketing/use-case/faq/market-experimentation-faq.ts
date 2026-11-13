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
export function formatMarketExperimentationFaq(intl: IntlShape): {
  heading: string;
  subheading: string;
  items: HomepageFaqItem[];
} {
  return {
    heading: intl.formatMessage({
      defaultMessage: "A few things\nyou might ask.",
      id: "sIUuNmLPbN",
      description: "FAQ heading on the market-experimentation use case page",
    }),
    subheading: intl.formatMessage({
      defaultMessage: "Testing what each market prefers.",
      id: "XRtOopRA+P",
      description: "FAQ subheading on the market-experimentation use case page",
    }),
    items: [
      {
        question: intl.formatMessage({
          defaultMessage: "What can I change for one market?",
          id: "qZHSANtPhP",
          description: "market-experimentation use case FAQ question 1",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Headlines, how prices display, checkout steps, and whole flows. Each change is shown only to the audience you choose, such as visitors in Japan.",
          id: "EDhbrt8fEh",
          description: "market-experimentation use case FAQ answer 1",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "How are audiences defined?",
          id: "S45cMpoL/R",
          description: "market-experimentation use case FAQ question 2",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "By country, language, or both, with rules your team can read. You can start with one market and add more as results come in.",
          id: "wQuUUrsgYS",
          description: "market-experimentation use case FAQ answer 2",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Do we need engineering for every test?",
          id: "ya8QsPN4WM",
          description: "market-experimentation use case FAQ question 3",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Engineering adds the flag once. After that, growth and localisation teams can create variants and run market tests from the workspace.",
          id: "pyx4/JXUpj",
          description: "market-experimentation use case FAQ answer 3",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "How do we know which version wins?",
          id: "dnvLPoeTlZ",
          description: "market-experimentation use case FAQ question 4",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Each experiment tracks the goal you pick, such as completed checkouts, for the original and the local variant, and shows the difference and how confident the result is.",
          id: "k76ZxU2DpO",
          description: "market-experimentation use case FAQ answer 4",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Can variants use our glossary and brand voice?",
          id: "gSYppf4/tI",
          description: "market-experimentation use case FAQ question 5",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Yes. Variants are written in the same workspace as your translations, so glossary terms and guidelines apply, and an agent can draft them for review.",
          id: "c09+BxkA6O",
          description: "market-experimentation use case FAQ answer 5",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "What happens after a test wins?",
          id: "bib+S1ppwH",
          description: "market-experimentation use case FAQ question 6",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Keep the winner in that market, then roll it out or test it in the next market most likely to respond, without rebuilding it.",
          id: "Ofu6lermWd",
          description: "market-experimentation use case FAQ answer 6",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Does this replace our A/B testing tool?",
          id: "uO35XYN/lH",
          description: "market-experimentation use case FAQ question 7",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Not necessarily. Hyperlab focuses on market-specific changes next to your localised content. Many teams keep their main experimentation tool for global product tests.",
          id: "v3NB6W1+Ym",
          description: "market-experimentation use case FAQ answer 7",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Who is this for?",
          id: "ToVc09tSeq",
          description: "market-experimentation use case FAQ question 8",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "International growth teams that want each market to get the version that works there, not just a translation of the home market.",
          id: "2bcqIKg6pj",
          description: "market-experimentation use case FAQ answer 8",
        }),
      },
    ],
  };
}
