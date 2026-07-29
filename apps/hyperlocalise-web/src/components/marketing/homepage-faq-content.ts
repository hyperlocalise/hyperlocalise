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
import type { FAQPage, WithContext } from "schema-dts";

import { getIntlShape } from "@/lib/app-i18n/intl";

export type HomepageFaqItem = {
  question: string;
  answer: string;
};

export function getHomepageFaqItems(locale: string): HomepageFaqItem[] {
  const intl = getIntlShape(locale);

  return [
    {
      question: intl.formatMessage({
        defaultMessage: "Do I need to replace my TMS?",
        id: "Fm4Rzqmp2/",
        description: "Homepage FAQ question about replacing an existing TMS",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "No. Hyperlocalise works alongside your existing TMS. Keep using Phrase, Lokalise, Crowdin or Smartling while Hyperlocalise orchestrates AI agents, review workflows, context discovery and quality checks.",
        id: "YIX0kOlYt0",
        description: "Homepage FAQ answer about working with an existing TMS",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How is Hyperlocalise different from AI translation?",
        id: "uMB4LineFP",
        description: "Homepage FAQ question comparing Hyperlocalise with AI translation",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "AI translation generates text. Hyperlocalise manages the entire localisation workflow—from discovering context and assigning AI agents to coordinating human review, syncing with your TMS and preventing regressions before release.",
        id: "YjvgVDe80A",
        description: "Homepage FAQ answer comparing Hyperlocalise with AI translation",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "What is Translation Intelligence?",
        id: "DNjUZTzqsq",
        description: "Homepage FAQ question about Translation Intelligence",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Translation Intelligence is Hyperlocalise’s approach to giving AI and reviewers the context they need to make better localisation decisions. Instead of translating isolated strings, Hyperlocalise automatically surfaces repository context, terminology, previous decisions and product knowledge.",
        id: "F6jUO01B6K",
        description: "Homepage FAQ answer defining Translation Intelligence",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Can I use my preferred AI models?",
        id: "YNuOCyPMCd",
        description: "Homepage FAQ question about supported AI models",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Yes. Hyperlocalise is LLM-agnostic. Use OpenAI, Anthropic, Gemini or your preferred provider, and switch models without changing your workflow.",
        id: "NwyqQCxTLG",
        description: "Homepage FAQ answer about supported AI models",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Does Hyperlocalise work with GitHub?",
        id: "2o5nZo9c+I",
        description: "Homepage FAQ question about GitHub integration",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Yes. Repository changes, pull requests and release workflows can automatically become localisation tasks. Hyperlocalise also adds localisation checks to your CI/CD pipeline before code reaches production.",
        id: "G5X9k5HMha",
        description: "Homepage FAQ answer about GitHub integration",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How does Hyperlocalise find context automatically?",
        id: "3067sEMny+",
        description: "Homepage FAQ question about automatic context discovery",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Our AI agents search your repository, documentation, translation memory and terminology to attach relevant context before translation begins. Translators and reviewers spend less time asking questions and more time shipping.",
        id: "YrE1KC753H",
        description: "Homepage FAQ answer about automatic context discovery",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Can translators chat with AI inside Hyperlocalise?",
        id: "iPIf89d9nW",
        description: "Homepage FAQ question about chatting with AI",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Yes. Simply ask about a string, feature or translation, and Hyperlocalise searches your repository and available context before answering.",
        id: "AfLb8PFRl0",
        description: "Homepage FAQ answer about chatting with AI",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How do you ensure AI translation quality?",
        id: "7jGjjgImqC",
        description: "Homepage FAQ question about AI translation quality",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Hyperlocalise combines AI with human review, regression evaluations, terminology checks and release gates so localisation quality doesn’t silently drift over time.",
        id: "/powsKQ55L",
        description: "Homepage FAQ answer about AI translation quality",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Who is Hyperlocalise built for?",
        id: "kU9ZZlDF/l",
        description: "Homepage FAQ question about the target audience",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Software companies and localisation teams that want to launch globally faster without replacing their existing tools or sacrificing translation quality.",
        id: "5UK41gXo2F",
        description: "Homepage FAQ answer about the target audience",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How quickly can we get started?",
        id: "UWwGwAtcmr",
        description: "Homepage FAQ question about getting started",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Most teams can connect their repositories, AI providers and existing TMS without changing how they currently manage localisation.",
        id: "LhmocGd1bG",
        description: "Homepage FAQ answer about getting started",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Why do companies launch in quarters instead of days?",
        id: "xDlcmJ2xzu",
        description: "Homepage FAQ question about slow global launches",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Because localisation isn’t slowed by translation anymore. Teams lose time gathering context, coordinating reviewers, switching between tools and fixing issues after release. Hyperlocalise automates these workflows so teams can move continuously.",
        id: "sSszzKe0NY",
        description: "Homepage FAQ answer about slow global launches",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Do I need to migrate my existing translations?",
        id: "HcFGSr9o03",
        description: "Homepage FAQ question about migrating existing translations",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "No. Hyperlocalise works with your existing repositories, translation memory and TMS, so you can adopt it incrementally instead of starting from scratch.",
        id: "k+dQ8UYqvJ",
        description: "Homepage FAQ answer about migrating existing translations",
      }),
    },
  ];
}

export function buildHomepageFaqJsonLd(items: readonly HomepageFaqItem[]): WithContext<FAQPage> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
