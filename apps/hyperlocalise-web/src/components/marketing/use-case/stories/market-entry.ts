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
// Generated from the use case story spec; edit copy here, keep keys stable.
import { defineMessages } from "react-intl";

import type { UseCaseStory } from "../use-case-story-types";

const m = defineMessages({
  heroHeadline: {
    defaultMessage: "Find the markets worth entering, then win them",
    id: "jSR0s4+XhY",
    description: "market-entry use case page: hero › headline",
  },
  heroBody: {
    defaultMessage:
      "See how each market searches for what you sell, where you rank, and how AI answers talk about you. Then create the localised content that captures that demand.",
    id: "y2WmLzVX+A",
    description: "market-entry use case page: hero › body",
  },
  shiftTitle: {
    defaultMessage: "From guessing at markets to entering with evidence",
    id: "T4lytHZBeL",
    description: "market-entry use case page: shift › title",
  },
  shiftBefore0: {
    defaultMessage: "Market choices are made on instinct or a competitor's move.",
    id: "AE0pzlfqiF",
    description: "market-entry use case page: shift › before › #1",
  },
  shiftBefore1: {
    defaultMessage: "Translated pages launch without anyone checking what locals search for.",
    id: "mm5ZRmqi9B",
    description: "market-entry use case page: shift › before › #2",
  },
  shiftBefore2: {
    defaultMessage: "Nobody knows whether AI assistants recommend you in that market.",
    id: "U8D0szSX5O",
    description: "market-entry use case page: shift › before › #3",
  },
  shiftAfter0: {
    defaultMessage: "Search demand, rankings, and AI visibility for up to 16 markets per domain.",
    id: "7Ya+6umb0G",
    description: "market-entry use case page: shift › after › #1",
  },
  shiftAfter1: {
    defaultMessage: "Local keywords and questions shape content before it is written.",
    id: "3EE/kVhr/n",
    description: "market-entry use case page: shift › after › #2",
  },
  shiftAfter2: {
    defaultMessage: "Hreflang, coverage, and localisation health checked across your site.",
    id: "0RmSJQfHh9",
    description: "market-entry use case page: shift › after › #3",
  },
  guideTitle: {
    defaultMessage: "From first research to ranking in a new market",
    id: "W8ibwqiHYe",
    description: "market-entry use case page: guide › title",
  },
  guideBody: {
    defaultMessage:
      "Start with the free localisation audit, then turn what you learn into content.",
    id: "d55NFCjisC",
    description: "market-entry use case page: guide › body",
  },
  guideSteps0Title: {
    defaultMessage: "Audit your site",
    id: "Iva3raiCa1",
    description: "market-entry use case page: guide › steps › #1 › title",
  },
  guideSteps0Body: {
    defaultMessage:
      "Run a free localisation audit to see hreflang errors, missing translations, and how ready each page is for international search.",
    id: "a8rVyzYzEC",
    description: "market-entry use case page: guide › steps › #1 › body",
  },
  guideSteps0VisualTitle: {
    defaultMessage: "Localisation audit",
    id: "hKlAnVHJ10",
    description: "market-entry use case page: guide › steps › #1 › visual › title",
  },
  guideSteps0VisualSubtitle: {
    defaultMessage: "example.com · 842 pages",
    id: "V9n1IOkfCI",
    description: "market-entry use case page: guide › steps › #1 › visual › subtitle",
  },
  guideSteps0VisualMetrics0Label: {
    defaultMessage: "Localisation",
    id: "FYmiAqTNMJ",
    description: "market-entry use case page: guide › steps › #1 › visual › metrics › #1 › label",
  },
  guideSteps0VisualMetrics1Label: {
    defaultMessage: "SEO",
    id: "GKd0g1Ty7D",
    description: "market-entry use case page: guide › steps › #1 › visual › metrics › #2 › label",
  },
  guideSteps0VisualMetrics2Label: {
    defaultMessage: "AI answers",
    id: "moYu5IGklu",
    description: "market-entry use case page: guide › steps › #1 › visual › metrics › #3 › label",
  },
  guideSteps1Title: {
    defaultMessage: "Research each market",
    id: "zeCCPbswVN",
    description: "market-entry use case page: guide › steps › #2 › title",
  },
  guideSteps1Body: {
    defaultMessage:
      "Pick up to 16 markets. See search volume, ranking keywords, and estimated traffic, with recommendations where you already have signals.",
    id: "pJ22gupXYt",
    description: "market-entry use case page: guide › steps › #2 › body",
  },
  guideSteps1VisualTitle: {
    defaultMessage: "Recommended markets",
    id: "BrxAqRqD12",
    description: "market-entry use case page: guide › steps › #2 › visual › title",
  },
  guideSteps1VisualSubtitle: {
    defaultMessage: "Based on existing search signals",
    id: "EKb8mS6fsX",
    description: "market-entry use case page: guide › steps › #2 › visual › subtitle",
  },
  guideSteps1VisualItems0Label: {
    defaultMessage: "German · Germany",
    id: "sQ49SSpqYi",
    description: "market-entry use case page: guide › steps › #2 › visual › items › #1 › label",
  },
  guideSteps1VisualItems0Meta: {
    defaultMessage: "Strong · 1,180 ranking keywords",
    id: "jRWu04SGf8",
    description: "market-entry use case page: guide › steps › #2 › visual › items › #1 › meta",
  },
  guideSteps1VisualItems1Label: {
    defaultMessage: "Spanish · Mexico",
    id: "UxQMZuDfCr",
    description: "market-entry use case page: guide › steps › #2 › visual › items › #2 › label",
  },
  guideSteps1VisualItems1Meta: {
    defaultMessage: "Strong · 860 ranking keywords",
    id: "X+9kn2ZYxR",
    description: "market-entry use case page: guide › steps › #2 › visual › items › #2 › meta",
  },
  guideSteps1VisualItems2Label: {
    defaultMessage: "Japanese · Japan",
    id: "5HUtbD7S5G",
    description: "market-entry use case page: guide › steps › #2 › visual › items › #3 › label",
  },
  guideSteps1VisualItems2Meta: {
    defaultMessage: "Emerging · 240 ranking keywords",
    id: "SpO4+ZARuJ",
    description: "market-entry use case page: guide › steps › #2 › visual › items › #3 › meta",
  },
  guideSteps1VisualItems3Label: {
    defaultMessage: "French · Canada",
    id: "KBr0pLWrIJ",
    description: "market-entry use case page: guide › steps › #2 › visual › items › #4 › label",
  },
  guideSteps1VisualItems3Meta: {
    defaultMessage: "Low signal",
    id: "OsI2byWakV",
    description: "market-entry use case page: guide › steps › #2 › visual › items › #4 › meta",
  },
  guideSteps2Title: {
    defaultMessage: "Write for local demand",
    id: "pbvd5zwyWf",
    description: "market-entry use case page: guide › steps › #3 › title",
  },
  guideSteps2Body: {
    defaultMessage:
      "Save the terms people actually search for, then brief translation and content with them so pages match local intent.",
    id: "zdAQY+IIRF",
    description: "market-entry use case page: guide › steps › #3 › body",
  },
  guideSteps2VisualTitle: {
    defaultMessage: "Keyword brief",
    id: "crt5xcZBYE",
    description: "market-entry use case page: guide › steps › #3 › visual › title",
  },
  guideSteps2VisualSubtitle: {
    defaultMessage: "Japanese · Japan",
    id: "lV0iQMl7pP",
    description: "market-entry use case page: guide › steps › #3 › visual › subtitle",
  },
  guideSteps2VisualRows0Note: {
    defaultMessage: "Matches what Japanese buyers search for",
    id: "ZVIdY83zww",
    description: "market-entry use case page: guide › steps › #3 › visual › rows › #1 › note",
  },
  guideSteps2VisualRows1Note: {
    defaultMessage: "Higher search volume than the literal translation",
    id: "Typ8WyZjSa",
    description: "market-entry use case page: guide › steps › #3 › visual › rows › #2 › note",
  },
  guideSteps3Title: {
    defaultMessage: "Track rankings and AI answers",
    id: "aJ5xMxl4tC",
    description: "market-entry use case page: guide › steps › #4 › title",
  },
  guideSteps3Body: {
    defaultMessage:
      "Follow rankings and AI visibility per market over time, and feed what works into the next round of content.",
    id: "5cb2gpSAPa",
    description: "market-entry use case page: guide › steps › #4 › body",
  },
  guideSteps3VisualTitle: {
    defaultMessage: "Mexico · last 90 days",
    id: "xt4r+UxQd2",
    description: "market-entry use case page: guide › steps › #4 › visual › title",
  },
  guideSteps3VisualMetrics0Label: {
    defaultMessage: "Ranking keywords",
    id: "HZqyUQkgnD",
    description: "market-entry use case page: guide › steps › #4 › visual › metrics › #1 › label",
  },
  guideSteps3VisualMetrics1Label: {
    defaultMessage: "Top 10 rankings",
    id: "9ou3lz2Ao0",
    description: "market-entry use case page: guide › steps › #4 › visual › metrics › #2 › label",
  },
  guideSteps3VisualMetrics2Label: {
    defaultMessage: "AI answer mentions",
    id: "zqqpXZqkv/",
    description: "market-entry use case page: guide › steps › #4 › visual › metrics › #3 › label",
  },
  integrationsTitle: {
    defaultMessage: "Uses the tools growth teams already rely on",
    id: "Xp9KeCyyBF",
    description: "market-entry use case page: integrations › title",
  },
  capabilitiesTitle: {
    defaultMessage: "Everything you need to enter a market with confidence",
    id: "nsc/w284Ji",
    description: "market-entry use case page: capabilities › title",
  },
  capabilitiesItems0Title: {
    defaultMessage: "Free localisation audit",
    id: "ZJXCUGFVC6",
    description: "market-entry use case page: capabilities › items › #1 › title",
  },
  capabilitiesItems0Body: {
    defaultMessage: "Score any site for hreflang, coverage, and international search readiness.",
    id: "DdcsYc5sWK",
    description: "market-entry use case page: capabilities › items › #1 › body",
  },
  capabilitiesItems1Title: {
    defaultMessage: "Market recommendations",
    id: "c3zbAWWzE8",
    description: "market-entry use case page: capabilities › items › #2 › title",
  },
  capabilitiesItems1Body: {
    defaultMessage: "See where your domain already has search signals worth building on.",
    id: "Uqi9+fNWH6",
    description: "market-entry use case page: capabilities › items › #2 › body",
  },
  capabilitiesItems2Title: {
    defaultMessage: "Keyword research by market",
    id: "TO7hztpoJo",
    description: "market-entry use case page: capabilities › items › #3 › title",
  },
  capabilitiesItems2Body: {
    defaultMessage:
      "Find the words each market uses for your topic, and save the ones worth targeting.",
    id: "Z35/ZO9eJq",
    description: "market-entry use case page: capabilities › items › #3 › body",
  },
  capabilitiesItems3Title: {
    defaultMessage: "Rank tracking",
    id: "NQQGY27fEL",
    description: "market-entry use case page: capabilities › items › #4 › title",
  },
  capabilitiesItems3Body: {
    defaultMessage: "Follow positions for the keywords that matter in every market.",
    id: "n0CWXNm892",
    description: "market-entry use case page: capabilities › items › #4 › body",
  },
  capabilitiesItems4Title: {
    defaultMessage: "AI visibility",
    id: "nVBl9MRJ8G",
    description: "market-entry use case page: capabilities › items › #5 › title",
  },
  capabilitiesItems4Body: {
    defaultMessage: "See how AI engines describe and recommend you in each market.",
    id: "eteXOkGnoY",
    description: "market-entry use case page: capabilities › items › #5 › body",
  },
  capabilitiesItems5Title: {
    defaultMessage: "From research to content",
    id: "DZJlehP6ur",
    description: "market-entry use case page: capabilities › items › #6 › title",
  },
  capabilitiesItems5Body: {
    defaultMessage: "Turn saved keywords into briefs for translation and new local content.",
    id: "wovJr7KfWJ",
    description: "market-entry use case page: capabilities › items › #6 › body",
  },
  scenarioTitle: {
    defaultMessage: "Choosing between Japan and Mexico",
    id: "fZVTw+Q4AZ",
    description: "market-entry use case page: scenario › title",
  },
  scenarioBody: {
    defaultMessage:
      "How a growth team uses evidence, not instinct, to pick its next market and launch there.",
    id: "TCcILfm3Tb",
    description: "market-entry use case page: scenario › body",
  },
  scenarioEvents0Time: {
    defaultMessage: "Week 1",
    id: "KyorYZgBsA",
    description: "market-entry use case page: scenario › events › #1 › time",
  },
  scenarioEvents0Title: {
    defaultMessage: "Audit and shortlist",
    id: "Tl1ZDksRSg",
    description: "market-entry use case page: scenario › events › #1 › title",
  },
  scenarioEvents0Body: {
    defaultMessage:
      "The free audit shows hreflang gaps on the German site. Market research shortlists Japan and Mexico.",
    id: "i/+QuLoXsi",
    description: "market-entry use case page: scenario › events › #1 › body",
  },
  scenarioEvents1Time: {
    defaultMessage: "Week 2",
    id: "3razqUSW/7",
    description: "market-entry use case page: scenario › events › #2 › time",
  },
  scenarioEvents1Title: {
    defaultMessage: "Compare demand",
    id: "HytVp650aU",
    description: "market-entry use case page: scenario › events › #2 › title",
  },
  scenarioEvents1Body: {
    defaultMessage:
      "Mexico shows strong existing signals. Japan shows high demand but few rankings. The team picks Mexico first.",
    id: "UvoVmq6rxx",
    description: "market-entry use case page: scenario › events › #2 › body",
  },
  scenarioEvents2Time: {
    defaultMessage: "Week 3",
    id: "kPlrpUs5uf",
    description: "market-entry use case page: scenario › events › #3 › time",
  },
  scenarioEvents2Title: {
    defaultMessage: "Launch local pages",
    id: "q93LNJUfH9",
    description: "market-entry use case page: scenario › events › #3 › title",
  },
  scenarioEvents2Body: {
    defaultMessage:
      "Pricing and product pages are localised with the terms Mexican buyers search for, then reviewed by a local marketer.",
    id: "zgKuktFmKm",
    description: "market-entry use case page: scenario › events › #3 › body",
  },
  scenarioEvents3Time: {
    defaultMessage: "Week 8",
    id: "lWrqKOt9WJ",
    description: "market-entry use case page: scenario › events › #4 › time",
  },
  scenarioEvents3Title: {
    defaultMessage: "Measure and repeat",
    id: "vS/SIpAGyU",
    description: "market-entry use case page: scenario › events › #4 › title",
  },
  scenarioEvents3Body: {
    defaultMessage: "Rankings and AI mentions climb. The same playbook is queued for Japan.",
    id: "NxZ1+uFfVi",
    description: "market-entry use case page: scenario › events › #4 › body",
  },
  ctaHeadline: {
    defaultMessage: "Pick your next market with evidence",
    id: "Gble1cdyuU",
    description: "market-entry use case page: cta › headline",
  },
  ctaBody: {
    defaultMessage:
      "Run a free localisation audit, then see search demand, rankings, and AI visibility for the markets you want to win.",
    id: "BpmW9l3lxM",
    description: "market-entry use case page: cta › body",
  },
});

export const marketEntryStory: UseCaseStory = {
  slug: "market-entry",
  hero: {
    headline: m.heroHeadline,
    body: m.heroBody,
    visual: {
      kind: "domains",
    },
  },
  shift: {
    title: m.shiftTitle,
    before: [m.shiftBefore0, m.shiftBefore1, m.shiftBefore2],
    after: [m.shiftAfter0, m.shiftAfter1, m.shiftAfter2],
  },
  guide: {
    title: m.guideTitle,
    body: m.guideBody,
    steps: [
      {
        title: m.guideSteps0Title,
        body: m.guideSteps0Body,
        visual: {
          kind: "metrics",
          title: m.guideSteps0VisualTitle,
          subtitle: m.guideSteps0VisualSubtitle,
          metrics: [
            {
              label: m.guideSteps0VisualMetrics0Label,
              value: "64",
              tone: "watch",
            },
            {
              label: m.guideSteps0VisualMetrics1Label,
              value: "78",
              tone: "neutral",
            },
            {
              label: m.guideSteps0VisualMetrics2Label,
              value: "71",
              tone: "neutral",
            },
          ],
          bars: [
            {
              label: "de-DE",
              value: 72,
            },
            {
              label: "fr-FR",
              value: 58,
            },
            {
              label: "es-MX",
              value: 66,
            },
            {
              label: "ja-JP",
              value: 41,
            },
          ],
        },
      },
      {
        title: m.guideSteps1Title,
        body: m.guideSteps1Body,
        visual: {
          kind: "checklist",
          title: m.guideSteps1VisualTitle,
          subtitle: m.guideSteps1VisualSubtitle,
          items: [
            {
              label: m.guideSteps1VisualItems0Label,
              meta: m.guideSteps1VisualItems0Meta,
              status: "done",
            },
            {
              label: m.guideSteps1VisualItems1Label,
              meta: m.guideSteps1VisualItems1Meta,
              status: "done",
            },
            {
              label: m.guideSteps1VisualItems2Label,
              meta: m.guideSteps1VisualItems2Meta,
              status: "running",
            },
            {
              label: m.guideSteps1VisualItems3Label,
              meta: m.guideSteps1VisualItems3Meta,
              status: "todo",
            },
          ],
        },
      },
      {
        title: m.guideSteps2Title,
        body: m.guideSteps2Body,
        visual: {
          kind: "strings",
          title: m.guideSteps2VisualTitle,
          subtitle: m.guideSteps2VisualSubtitle,
          rows: [
            {
              key: "pricing.title",
              source: "Pricing",
              target: "料金プラン",
              locale: "ja-JP",
              status: "done",
              note: m.guideSteps2VisualRows0Note,
            },
            {
              key: "hero.headline",
              source: "Translation software",
              target: "翻訳管理システム",
              locale: "ja-JP",
              status: "done",
              note: m.guideSteps2VisualRows1Note,
            },
          ],
        },
      },
      {
        title: m.guideSteps3Title,
        body: m.guideSteps3Body,
        visual: {
          kind: "metrics",
          title: m.guideSteps3VisualTitle,
          metrics: [
            {
              label: m.guideSteps3VisualMetrics0Label,
              value: "1,412",
              delta: "+64%",
              tone: "good",
            },
            {
              label: m.guideSteps3VisualMetrics1Label,
              value: "184",
              delta: "+47",
              tone: "good",
            },
            {
              label: m.guideSteps3VisualMetrics2Label,
              value: "23",
              delta: "+15",
              tone: "good",
            },
          ],
        },
      },
    ],
  },
  integrations: {
    title: m.integrationsTitle,
    ids: ["semrush", "ahrefs", "contentful", "hubspot", "slack", "github", "openai", "gemini"],
  },
  capabilities: {
    title: m.capabilitiesTitle,
    items: [
      {
        title: m.capabilitiesItems0Title,
        body: m.capabilitiesItems0Body,
      },
      {
        title: m.capabilitiesItems1Title,
        body: m.capabilitiesItems1Body,
      },
      {
        title: m.capabilitiesItems2Title,
        body: m.capabilitiesItems2Body,
      },
      {
        title: m.capabilitiesItems3Title,
        body: m.capabilitiesItems3Body,
      },
      {
        title: m.capabilitiesItems4Title,
        body: m.capabilitiesItems4Body,
      },
      {
        title: m.capabilitiesItems5Title,
        body: m.capabilitiesItems5Body,
      },
    ],
  },
  scenario: {
    title: m.scenarioTitle,
    body: m.scenarioBody,
    events: [
      {
        time: m.scenarioEvents0Time,
        title: m.scenarioEvents0Title,
        body: m.scenarioEvents0Body,
      },
      {
        time: m.scenarioEvents1Time,
        title: m.scenarioEvents1Title,
        body: m.scenarioEvents1Body,
      },
      {
        time: m.scenarioEvents2Time,
        title: m.scenarioEvents2Title,
        body: m.scenarioEvents2Body,
      },
      {
        time: m.scenarioEvents3Time,
        title: m.scenarioEvents3Title,
        body: m.scenarioEvents3Body,
      },
    ],
  },
  cta: {
    headline: m.ctaHeadline,
    body: m.ctaBody,
  },
};
