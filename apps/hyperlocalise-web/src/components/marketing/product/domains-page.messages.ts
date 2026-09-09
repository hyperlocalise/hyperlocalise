"use client";

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
import { defineMessages } from "react-intl";

export const domainsPageMessages = defineMessages({
  heroEyebrow: {
    defaultMessage: "Domains",
    id: "q82hDvskBV",
    description: "Hero eyebrow for the Domains product page",
  },
  heroHeadline: {
    defaultMessage: "Publish once.\nGet found everywhere.",
    id: "BbOj+wUXk0",
    description: "Hero headline for the Domains product page",
  },
  heroSubcopy: {
    defaultMessage:
      "Put your pages live in every language. Domains watches search and AI answers, then shows you what to fix.",
    id: "44qNLsa5bU",
    description: "Hero description for the Domains product page",
  },
  requestDemo: {
    defaultMessage: "Request a Demo",
    id: "Lj3BZpxg6f",
    description: "Call-to-action to request a Domains demo",
  },
  exploreDomains: {
    defaultMessage: "See a site audit",
    id: "bjsHedIAkd",
    description: "Anchor link from the Domains hero to the product preview",
  },
  fromPublishToFound: {
    defaultMessage: "From a live page to a page people can find.",
    id: "Rxt6SwzGmb",
    description: "Caption under the Domains preview",
  },
  stepPublish: {
    defaultMessage: "01 Publish",
    id: "BPMUoJXbTa",
    description: "Domains workflow step 1",
  },
  stepLanguages: {
    defaultMessage: "02 Check every language",
    id: "DMziALn6m4",
    description: "Domains workflow step 2",
  },
  stepSearch: {
    defaultMessage: "03 Fix what search misses",
    id: "gXZfoeQ6KB",
    description: "Domains workflow step 3",
  },
  stepFound: {
    defaultMessage: "04 Get found",
    id: "L2f4AH9U80",
    description: "Domains workflow step 4",
  },
  solutionsEyebrow: {
    defaultMessage: "What Domains checks",
    id: "BH3cs7sGM9",
    description: "Eyebrow for the Domains solutions section",
  },
  solutionsHeadline: {
    defaultMessage: "Languages.\nSearch.\nAI answers.",
    id: "4Aefl4GjbY",
    description: "Headline for the Domains solutions section",
  },
  solutionsBody: {
    defaultMessage:
      "A page can be live and still be invisible. Domains shows the gaps in each language, in search, and in AI answers.",
    id: "FaT5oUwQOq",
    description: "Body copy for the Domains solutions section",
  },
  solutionsAriaLabel: {
    defaultMessage: "Domains solutions",
    id: "K/SUM2c9Dk",
    description: "Accessible label for the Domains solution tabs",
  },
  solutionLocalisation: {
    defaultMessage: "Every language",
    id: "aFsNlAnIlu",
    description: "Domains solution tab for localisation",
  },
  solutionSeo: {
    defaultMessage: "Search",
    id: "f46AmI9URt",
    description: "Domains solution tab for SEO",
  },
  solutionAeo: {
    defaultMessage: "AI answers",
    id: "w/OKtwjgIh",
    description: "Domains solution tab for AEO",
  },
  localisationTitle: {
    defaultMessage: "Every language.\nThe right page.",
    id: "w1aJulNG2a",
    description: "Title for the Domains localisation solution panel",
  },
  localisationBody: {
    defaultMessage:
      "If French visitors land on English, or a language is missing, Domains flags it before a customer does.",
    id: "7Mb6b+z2q1",
    description: "Body for the Domains localisation solution panel",
  },
  localisationLink: {
    defaultMessage: "From hreflang to locale coverage",
    id: "Un7mRcQrna",
    description: "Supporting line for the Domains localisation solution panel",
  },
  seoTitle: {
    defaultMessage: "Help Google find you.",
    id: "aBdSYSGyjv",
    description: "Title for the Domains SEO solution panel",
  },
  seoBody: {
    defaultMessage:
      "Titles, descriptions, and indexability are checked in every market, not only in English.",
    id: "J/4xcmgL1G",
    description: "Body for the Domains SEO solution panel",
  },
  seoLink: {
    defaultMessage: "From meta tags to market snippets",
    id: "W5R39QzczX",
    description: "Supporting line for the Domains SEO solution panel",
  },
  aeoTitle: {
    defaultMessage: "Help AI answer with your page.",
    id: "3yZFMdlOT1",
    description: "Title for the Domains AEO solution panel",
  },
  aeoBody: {
    defaultMessage:
      "When someone asks ChatGPT or another AI search tool, they should still find you. Domains checks the structured answers that make that possible.",
    id: "zjUi7Y6uS4",
    description: "Body for the Domains AEO solution panel",
  },
  aeoLink: {
    defaultMessage: "From FAQ schema to cited answers",
    id: "OSLEez1pTU",
    description: "Supporting line for the Domains AEO solution panel",
  },
  liveEyebrow: {
    defaultMessage: "Your live site",
    id: "Llo60/JvXZ",
    description: "Eyebrow for the Domains live page section",
  },
  liveHeadline: {
    defaultMessage: "Switch language.\nSee what is broken.",
    id: "2+iIGrGb+G",
    description: "Headline for the Domains live page section",
  },
  liveBody: {
    defaultMessage:
      "This is the published page. Change the language, then tap an issue to see what search or AI would miss.",
    id: "dvW1qhsF0A",
    description: "Body for the Domains live page section",
  },
  liveCaption: {
    defaultMessage: "Published webpage preview",
    id: "ja9cL+H+5B",
    description: "Caption above the Domains published webpage preview",
  },
  liveStatus: {
    defaultMessage: "Published",
    id: "lMu61NG0z5",
    description: "Published status badge in the Domains webpage preview",
  },
  languageLabel: {
    defaultMessage: "Language",
    id: "eNUY3a6dwA",
    description: "Label for the language selector in the Domains webpage preview",
  },
  issuesHeading: {
    defaultMessage: "Open issues",
    id: "o/m/oSG780",
    description: "Heading for clickable audit issues on the Domains live preview",
  },
  issueHreflang: {
    defaultMessage: "French page is missing a language link",
    id: "t0biooOCbM",
    description: "Localisation issue in the Domains live preview",
  },
  issueMeta: {
    defaultMessage: "German page has no search description",
    id: "H0hPMXRA/Z",
    description: "SEO issue in the Domains live preview",
  },
  issueFaq: {
    defaultMessage: "English page has no FAQ for AI answers",
    id: "REMUySaHTw",
    description: "AEO issue in the Domains live preview",
  },
  highlightHreflang: {
    defaultMessage: "Language links on this URL do not match the French page.",
    id: "yrOEOBNsM7",
    description: "Highlight copy for a localisation issue on the live preview",
  },
  highlightMeta: {
    defaultMessage: "Search has no description to show under this title.",
    id: "muiA0TtFN7",
    description: "Highlight copy for an SEO issue on the live preview",
  },
  highlightFaq: {
    defaultMessage: "AI search has no FAQ block to quote from this page.",
    id: "M0znNdV8EN",
    description: "Highlight copy for an AEO issue on the live preview",
  },
  articleCategory: {
    defaultMessage: "Daylight journal",
    id: "OebStHzX3X",
    description: "Sample article category in the Domains live preview",
  },
  articleTitleEn: {
    defaultMessage: "See the world in a different light.",
    id: "DjyFDSQhTb",
    description: "English sample article title in the Domains live preview",
  },
  articleTitleFr: {
    defaultMessage: "Voyez le monde sous un autre jour.",
    id: "e3o5ny2S7S",
    description: "French sample article title in the Domains live preview",
  },
  articleTitleDe: {
    defaultMessage: "Die Welt in einem neuen Licht sehen.",
    id: "F3LRM6/D0t",
    description: "German sample article title in the Domains live preview",
  },
  articleIntroEn: {
    defaultMessage:
      "Every light has a story. Explore the places, people, and everyday moments that connect us across the world.",
    id: "ELdhYF24XP",
    description: "English sample article intro in the Domains live preview",
  },
  articleIntroFr: {
    defaultMessage:
      "Chaque lumière raconte une histoire. Découvrez les lieux, les personnes et les instants du quotidien qui nous relient.",
    id: "IeIy523DjY",
    description: "French sample article intro in the Domains live preview",
  },
  articleIntroDe: {
    defaultMessage:
      "Jedes Licht erzählt eine Geschichte. Entdecken Sie die Orte, Menschen und alltäglichen Momente, die uns verbinden.",
    id: "1n6nJH8E8P",
    description: "German sample article intro in the Domains live preview",
  },
  languageEnglish: {
    defaultMessage: "English",
    id: "CNDMCn/RSf",
    description: "English language name in the Domains live preview",
  },
  languageFrench: {
    defaultMessage: "Français",
    id: "d/WdYnGJ3q",
    description: "French language name in the Domains live preview",
  },
  languageGerman: {
    defaultMessage: "Deutsch",
    id: "NYvATJF9mO",
    description: "German language name in the Domains live preview",
  },
  searchEyebrow: {
    defaultMessage: "What people see",
    id: "D25ih6b6HA",
    description: "Eyebrow for the Domains search snippet section",
  },
  searchHeadline: {
    defaultMessage: "If search cannot read it,\nnobody clicks it.",
    id: "x0RZIzLSzE",
    description: "Headline for the Domains search snippet section",
  },
  searchBody: {
    defaultMessage:
      "This is the snippet Google would show. Missing descriptions and mixed languages are the usual reason a market never shows up.",
    id: "mQ36/6Ov5o",
    description: "Body for the Domains search snippet section",
  },
  searchUrl: {
    defaultMessage: "daylight.example.com › journal › a-different-light",
    id: "u5OvRKaeK4",
    description: "Sample search result URL in the Domains snippet mock",
  },
  searchMissing: {
    defaultMessage: "No description",
    id: "Tnbbm0vypB",
    description: "Missing meta description state in the Domains snippet mock",
  },
  connectedHeadline: {
    defaultMessage: "A site connected to the bigger picture.",
    id: "5yG0VUhaH4",
    description: "Headline for the Domains connected-products section",
  },
  connectedBody: {
    defaultMessage: "Write in Content Studio. Test what works in Hyperlab. Publish here.",
    id: "bnlEPVXJKa",
    description: "Body for the Domains connected-products section",
  },
  contentStudio: {
    defaultMessage: "Content Studio",
    id: "Nf32FGPaYc",
    description: "Link from Domains to the Content Studio product page",
  },
  hyperlab: {
    defaultMessage: "Hyperlab",
    id: "dDwlwYf96x",
    description: "Link from Domains to the Hyperlab product page",
  },
  faqHeading: {
    defaultMessage: "A few things\nyou might ask.",
    id: "+Dso3VFqcL",
    description: "FAQ heading on the Domains product page",
  },
  faqSubheading: {
    defaultMessage: "Getting to know Domains.",
    id: "+1fRGei56f",
    description: "FAQ subheading on the Domains product page",
  },
  faqWhatQuestion: {
    defaultMessage: "What is Domains, in one sentence?",
    id: "cLcD+lmoNa",
    description: "Domains FAQ question explaining the product",
  },
  faqWhatAnswer: {
    defaultMessage:
      "The place your live pages live, in every language, with checks so people can find them.",
    id: "4MIivcOetH",
    description: "Domains FAQ answer explaining the product",
  },
  faqLocalisationQuestion: {
    defaultMessage: "What does a localisation check look for?",
    id: "fdSqGVpQes",
    description: "Domains FAQ question about localisation audits",
  },
  faqLocalisationAnswer: {
    defaultMessage:
      "That each language has a page, and that the links between those pages are correct, so French visitors do not land on English.",
    id: "i/I7Lluh9S",
    description: "Domains FAQ answer about localisation audits",
  },
  faqSeoQuestion: {
    defaultMessage: "What does SEO mean here?",
    id: "NMY+NPW/Lt",
    description: "Domains FAQ question about SEO",
  },
  faqSeoAnswer: {
    defaultMessage:
      "Helping Google find and understand your pages in every market: titles, descriptions, and whether the page can be indexed.",
    id: "v4RjrMdGP3",
    description: "Domains FAQ answer about SEO",
  },
  faqAeoQuestion: {
    defaultMessage: "What is AEO?",
    id: "YokJOF4NZE",
    description: "Domains FAQ question about AEO",
  },
  faqAeoAnswer: {
    defaultMessage:
      "Answer engine optimisation. When someone asks an AI search tool, they can still get your page as the answer, not a competitor’s.",
    id: "oDluyiLepj",
    description: "Domains FAQ answer about AEO",
  },
  faqReplaceQuestion: {
    defaultMessage: "Do I need a new website?",
    id: "WLfXppMtrs",
    description: "Domains FAQ question about replacing a website",
  },
  faqReplaceAnswer: {
    defaultMessage:
      "No. Connect the site you already have. Domains publishes and checks it. You can also publish from Content Studio.",
    id: "16sYDMkqBx",
    description: "Domains FAQ answer about replacing a website",
  },
  faqFitQuestion: {
    defaultMessage: "How does Domains fit with the rest of Hyperlocalise?",
    id: "AbW9TjZ1cT",
    description: "Domains FAQ question about product fit",
  },
  faqFitAnswer: {
    defaultMessage:
      "Write in Content Studio. Test headlines in Hyperlab. Domains is where the live pages live and get found.",
    id: "0uaklEAkIh",
    description: "Domains FAQ answer about product fit",
  },
  faqWhoQuestion: {
    defaultMessage: "Who is Domains for?",
    id: "+nZWq6LHzf",
    description: "Domains FAQ question about audience",
  },
  faqWhoAnswer: {
    defaultMessage:
      "Teams who publish multilingual sites and care that search and AI can still find them.",
    id: "FBY0e+rFtV",
    description: "Domains FAQ answer about audience",
  },
  faqStartQuestion: {
    defaultMessage: "How can we get started?",
    id: "cCKX0XS/5C",
    description: "Domains FAQ question about getting started",
  },
  faqStartAnswer: {
    defaultMessage: "Request a demo. We will connect a domain and walk through the first audit.",
    id: "KZ/vDQOwnm",
    description: "Domains FAQ answer about getting started",
  },
  ctaHeadline: {
    defaultMessage: "Your site.\nReady for every market.",
    id: "lpOI0sCQXl",
    description: "Bottom CTA headline on the Domains product page",
  },
  ctaBody: {
    defaultMessage: "Publish the pages you already have, then fix what search and AI still miss.",
    id: "BDqDQOB6we",
    description: "Bottom CTA body on the Domains product page",
  },
  ctaNote: {
    defaultMessage: "Build your publishing workflow.",
    id: "NIhlMUMura",
    description: "Supporting note under the Domains bottom CTA",
  },
});
