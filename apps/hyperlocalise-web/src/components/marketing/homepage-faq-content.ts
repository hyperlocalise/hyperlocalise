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

import type { AppLocale } from "@/lib/app-i18n/locales";
import { jsonLdInLanguage } from "@/lib/seo/json-ld-in-language";

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
        defaultMessage: "What is Hyperlocalise?",
        id: "pOEw/4Kn/d",
        description: "Homepage FAQ question 1",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Hyperlocalise is an agentic localisation platform and translation management system (TMS) for international growth. We translate your websites and apps with your translation memory and glossaries, transcreate ads, images and video for local cultures with Iris, and check content against each market's rules with Guidelines.",
        id: "AekiFgAUvh",
        description: "Homepage FAQ answer 1",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How do I localise my website and app?",
        id: "xj1b981fhU",
        description: "Homepage FAQ question 2",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Connect your GitHub repository, CMS or TMS. Agents pick up new strings and content as you ship, translate them with your translation memory and glossary, route them to reviewers in the CAT workspace, and sync the result back. That is continuous localisation without manual file handoffs.",
        id: "4X/ML8XH2i",
        description: "Homepage FAQ answer 2",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Can Hyperlocalise replace Phrase, Lokalise, Crowdin or Smartling?",
        id: "yaSqLIgzu3",
        description: "Homepage FAQ question 3",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Yes. Hyperlocalise is a full TMS with translation memory, glossaries, a CAT editor and review workflows. Import your translation memory and glossaries to move over, or connect your current TMS to start right away and migrate at your own pace.",
        id: "xwWdFnLM37",
        description: "Homepage FAQ answer 3",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Which file formats and frameworks do you support?",
        id: "5IldWcgBYw",
        description: "Homepage FAQ question 4",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "JSON, JSONC, FormatJS and React Intl, ARB, XLIFF, gettext PO, Apple .strings and .stringsdict, CSV, HTML, Markdown and MDX. Sync them from your repository with the CLI or the GitHub Action.",
        id: "qSXWDhW1/B",
        description: "Homepage FAQ answer 4",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How do you keep translation quality high?",
        id: "N+smbFbjnh",
        description: "Homepage FAQ question 5",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Every translation uses your translation memory, glossary and style guides. Automated quality checks flag terminology and style issues, and reviewers approve in a CAT workspace with the source, target and product context side by side.",
        id: "PHie3wwyNS",
        description: "Homepage FAQ answer 5",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How do you adapt marketing images and video for other markets?",
        id: "MhfN9vbsYS",
        description: "Homepage FAQ question 6",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Iris, our AI localisation engine for multilingual assets, transcreates ad creative, images and video. It rewrites on-screen copy, adds subtitles and dubbing, and checks the layout in every language. Iris is in early access.",
        id: "UIoMT+lEyM",
        description: "Homepage FAQ answer 6",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How do you localise ad campaigns and marketing emails?",
        id: "KAgoq9ezfd",
        description: "Homepage FAQ question 13",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Iris transcreates ad copy, banners and video for each market. For email, connect Braze, HubSpot, Mailchimp, Iterable or Customer.io and localise templates and campaigns where your team already builds them.",
        id: "pm6XQRllKJ",
        description: "Homepage FAQ answer 13",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How do you check content against local regulations?",
        id: "Ccq8BmEgk8",
        description: "Homepage FAQ question 7",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Connect the policy and legal documents you already keep in Drive, Notion or SharePoint. Guidelines checks content against them, for example GDPR marketing claims, AI disclosures or health claims, and blocks anything that is not ready to publish.",
        id: "5cYfbA9FcQ",
        description: "Homepage FAQ answer 7",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Does Hyperlocalise help with international SEO?",
        id: "QwyTjrA7ZP",
        description: "Homepage FAQ question 8",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Yes. Domains publishes your multilingual pages and runs SEO and AEO checks, such as hreflang and metadata, so local customers find you in search and AI answers.",
        id: "5Cq13vDEuS",
        description: "Homepage FAQ answer 8",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Can we test what works in each market?",
        id: "l6JIbiqYrX",
        description: "Homepage FAQ question 9",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Yes. Hyperlab lets you run a different version in each market, measure what converts, and roll the winner out everywhere.",
        id: "UTNOMU+ANO",
        description: "Homepage FAQ answer 9",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Can we ask an agent to do the work?",
        id: "X7/gKCRQV5",
        description: "Homepage FAQ question 10",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Yes. Ask Hyperlocalise in Slack, Teams or GitHub, or connect it through MCP in Claude, Codex and Cursor. Agents handle the repeatable work while your team reviews and approves.",
        id: "fNECwAHlp0",
        description: "Homepage FAQ answer 10",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Can I use my preferred AI models?",
        id: "FWMLraU4B2",
        description: "Homepage FAQ question 11",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Yes. Hyperlocalise is LLM-agnostic. Use OpenAI, Anthropic, Gemini or your preferred provider, and switch models without changing your workflow.",
        id: "mYOHssr5f8",
        description: "Homepage FAQ answer 11",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Who is Hyperlocalise built for?",
        id: "FHgj/2FvSs",
        description: "Homepage FAQ question 12",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Localisation managers, international growth and marketing teams, and developers who need to launch in new markets quickly without losing quality, brand or compliance.",
        id: "SVRTCpilEO",
        description: "Homepage FAQ answer 12",
      }),
    },
  ];
}

export function buildHomepageFaqJsonLd(
  locale: AppLocale,
  items: readonly HomepageFaqItem[],
): WithContext<FAQPage> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: jsonLdInLanguage(locale),
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
