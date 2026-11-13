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
    defaultMessage: "Test what works in one market, then roll it out everywhere",
    id: "0aCzIhVvYm",
    description: "market-experimentation use case page: hero › headline",
  },
  heroBody: {
    defaultMessage:
      "Give Japan a different headline, price, or checkout than France. See which version wins with real visitors, then take the winner to every other market.",
    id: "5EQVaq67Z+",
    description: "market-experimentation use case page: hero › body",
  },
  shiftTitle: {
    defaultMessage: "From one global version to what each market prefers",
    id: "982/NDmKgK",
    description: "market-experimentation use case page: shift › title",
  },
  shiftBefore0: {
    defaultMessage: "Every market gets the same page, built for your home market.",
    id: "K9rOL1CMkZ",
    description: "market-experimentation use case page: shift › before › #1",
  },
  shiftBefore1: {
    defaultMessage: "A country-specific test needs engineering time you do not have.",
    id: "SfUTsvBQUE",
    description: "market-experimentation use case page: shift › before › #2",
  },
  shiftBefore2: {
    defaultMessage: "A win in one market is never repeated in the others.",
    id: "Zyhbmy6lIq",
    description: "market-experimentation use case page: shift › before › #3",
  },
  shiftAfter0: {
    defaultMessage: "Show a different version to visitors in a specific country.",
    id: "EXTkmfmNRT",
    description: "market-experimentation use case page: shift › after › #1",
  },
  shiftAfter1: {
    defaultMessage: "Launch market tests from the same workspace as your content.",
    id: "V60r6fpD8C",
    description: "market-experimentation use case page: shift › after › #2",
  },
  shiftAfter2: {
    defaultMessage: "Roll a proven winner out to the next market in a few clicks.",
    id: "exMPXH3sui",
    description: "market-experimentation use case page: shift › after › #3",
  },
  guideTitle: {
    defaultMessage: "From an idea to a winning version in every market",
    id: "Xdjkl+GU1P",
    description: "market-experimentation use case page: guide › title",
  },
  guideBody: {
    defaultMessage:
      "Experiments sit next to your localised content, so testing a market is as easy as translating for it.",
    id: "OAvFY7ZULM",
    description: "market-experimentation use case page: guide › body",
  },
  guideSteps0Title: {
    defaultMessage: "Pick a market and a change",
    id: "zD5e3kfd0B",
    description: "market-experimentation use case page: guide › steps › #1 › title",
  },
  guideSteps0Body: {
    defaultMessage:
      "Choose the country and what to change: a headline, how prices display, a checkout step, or a whole flow.",
    id: "VUzyuwCnXK",
    description: "market-experimentation use case page: guide › steps › #1 › body",
  },
  guideSteps0VisualTitle: {
    defaultMessage: "New experiment",
    id: "gd3jONVykU",
    description: "market-experimentation use case page: guide › steps › #1 › visual › title",
  },
  guideSteps0VisualSubtitle: {
    defaultMessage: "Japan checkout",
    id: "Vozzjw3ayP",
    description: "market-experimentation use case page: guide › steps › #1 › visual › subtitle",
  },
  guideSteps0VisualItems0Label: {
    defaultMessage: "Audience",
    id: "vyY279V0qw",
    description:
      "market-experimentation use case page: guide › steps › #1 › visual › items › #1 › label",
  },
  guideSteps0VisualItems0Meta: {
    defaultMessage: "Visitors in Japan",
    id: "fZpkdKdGKD",
    description:
      "market-experimentation use case page: guide › steps › #1 › visual › items › #1 › meta",
  },
  guideSteps0VisualItems1Label: {
    defaultMessage: "Change",
    id: "mUpmPpei7c",
    description:
      "market-experimentation use case page: guide › steps › #1 › visual › items › #2 › label",
  },
  guideSteps0VisualItems1Meta: {
    defaultMessage: "Checkout headline",
    id: "9K6sjd+OUZ",
    description:
      "market-experimentation use case page: guide › steps › #1 › visual › items › #2 › meta",
  },
  guideSteps0VisualItems2Label: {
    defaultMessage: "Variants",
    id: "ozli3z0qlI",
    description:
      "market-experimentation use case page: guide › steps › #1 › visual › items › #3 › label",
  },
  guideSteps0VisualItems2Meta: {
    defaultMessage: "Original and local",
    id: "g29S2xdkRt",
    description:
      "market-experimentation use case page: guide › steps › #1 › visual › items › #3 › meta",
  },
  guideSteps0VisualItems3Label: {
    defaultMessage: "Goal",
    id: "c/G/vDzZjE",
    description:
      "market-experimentation use case page: guide › steps › #1 › visual › items › #4 › label",
  },
  guideSteps0VisualItems3Meta: {
    defaultMessage: "Completed checkouts",
    id: "HFLIEeGEAm",
    description:
      "market-experimentation use case page: guide › steps › #1 › visual › items › #4 › meta",
  },
  guideSteps1Title: {
    defaultMessage: "Create the local variant",
    id: "+AxXekxJ8u",
    description: "market-experimentation use case page: guide › steps › #2 › title",
  },
  guideSteps1Body: {
    defaultMessage:
      "Write the variant with your glossary and brand voice, or let an agent draft it from what works in that market.",
    id: "C4VQHW2rZR",
    description: "market-experimentation use case page: guide › steps › #2 › body",
  },
  guideSteps1VisualTitle: {
    defaultMessage: "Checkout headline · Japan",
    id: "JF3Qf/KWxN",
    description: "market-experimentation use case page: guide › steps › #2 › visual › title",
  },
  guideSteps1VisualVariants0Note: {
    defaultMessage: "Original",
    id: "F7h8ynRLpz",
    description:
      "market-experimentation use case page: guide › steps › #2 › visual › variants › #1 › note",
  },
  guideSteps1VisualVariants1Note: {
    defaultMessage: "Local variant",
    id: "5ykdkd6oqw",
    description:
      "market-experimentation use case page: guide › steps › #2 › visual › variants › #2 › note",
  },
  guideSteps2Title: {
    defaultMessage: "Run it with real visitors",
    id: "tQYP0mEqe4",
    description: "market-experimentation use case page: guide › steps › #3 › title",
  },
  guideSteps2Body: {
    defaultMessage:
      "Only visitors in that market see the change. Results update as traffic comes in.",
    id: "yaoAnC75sk",
    description: "market-experimentation use case page: guide › steps › #3 › body",
  },
  guideSteps2VisualTitle: {
    defaultMessage: "Japan checkout test",
    id: "44w8B0VKNi",
    description: "market-experimentation use case page: guide › steps › #3 › visual › title",
  },
  guideSteps2VisualSubtitle: {
    defaultMessage: "Day 14",
    id: "hrDUAkCRP1",
    description: "market-experimentation use case page: guide › steps › #3 › visual › subtitle",
  },
  guideSteps2VisualMetrics0Label: {
    defaultMessage: "Original",
    id: "FEF37M0oFr",
    description:
      "market-experimentation use case page: guide › steps › #3 › visual › metrics › #1 › label",
  },
  guideSteps2VisualMetrics1Label: {
    defaultMessage: "Local variant",
    id: "um4ID9w9pF",
    description:
      "market-experimentation use case page: guide › steps › #3 › visual › metrics › #2 › label",
  },
  guideSteps2VisualMetrics2Label: {
    defaultMessage: "Confidence",
    id: "4tTQzkp41D",
    description:
      "market-experimentation use case page: guide › steps › #3 › visual › metrics › #3 › label",
  },
  guideSteps3Title: {
    defaultMessage: "Roll out the winner",
    id: "cyIBFXiWZ+",
    description: "market-experimentation use case page: guide › steps › #4 › title",
  },
  guideSteps3Body: {
    defaultMessage:
      "Keep the winning version in Japan, then test or roll it out in the markets most likely to respond.",
    id: "LhaVWhw3K9",
    description: "market-experimentation use case page: guide › steps › #4 › body",
  },
  guideSteps3VisualTitle: {
    defaultMessage: "Rollout",
    id: "Uhw89WBq/5",
    description: "market-experimentation use case page: guide › steps › #4 › visual › title",
  },
  guideSteps3VisualSubtitle: {
    defaultMessage: "Local payment headline",
    id: "d7QSXkDk3n",
    description: "market-experimentation use case page: guide › steps › #4 › visual › subtitle",
  },
  guideSteps3VisualLocales0Note: {
    defaultMessage: "Winner",
    id: "ZiHHWnTAQ+",
    description:
      "market-experimentation use case page: guide › steps › #4 › visual › locales › #1 › note",
  },
  guideSteps3VisualLocales1Note: {
    defaultMessage: "Testing",
    id: "ROCi5JAcai",
    description:
      "market-experimentation use case page: guide › steps › #4 › visual › locales › #2 › note",
  },
  guideSteps3VisualLocales2Note: {
    defaultMessage: "Next",
    id: "nhWapFT3IJ",
    description:
      "market-experimentation use case page: guide › steps › #4 › visual › locales › #3 › note",
  },
  integrationsTitle: {
    defaultMessage: "Fits around your site and growth stack",
    id: "h4ilgkgCHw",
    description: "market-experimentation use case page: integrations › title",
  },
  capabilitiesTitle: {
    defaultMessage: "Market experiments without an engineering queue",
    id: "b5BW5WCo8Y",
    description: "market-experimentation use case page: capabilities › title",
  },
  capabilitiesItems0Title: {
    defaultMessage: "Market features",
    id: "3BUeVi4UCO",
    description: "market-experimentation use case page: capabilities › items › #1 › title",
  },
  capabilitiesItems0Body: {
    defaultMessage: "Show a different checkout, price, or flow to visitors in one country.",
    id: "hTkjMzZggq",
    description: "market-experimentation use case page: capabilities › items › #1 › body",
  },
  capabilitiesItems1Title: {
    defaultMessage: "Country A/B tests",
    id: "TEN7yEwWqi",
    description: "market-experimentation use case page: capabilities › items › #2 › title",
  },
  capabilitiesItems1Body: {
    defaultMessage: "Test a local variant against the original with real visitors.",
    id: "sO0j2c7vex",
    description: "market-experimentation use case page: capabilities › items › #2 › body",
  },
  capabilitiesItems2Title: {
    defaultMessage: "Audiences by market",
    id: "oKoIoVIaUG",
    description: "market-experimentation use case page: capabilities › items › #3 › title",
  },
  capabilitiesItems2Body: {
    defaultMessage: "Target by country, language, or both, with rules your team can read.",
    id: "KssKLf+Kx8",
    description: "market-experimentation use case page: capabilities › items › #3 › body",
  },
  capabilitiesItems3Title: {
    defaultMessage: "Localised variants",
    id: "NjVAhOwOJv",
    description: "market-experimentation use case page: capabilities › items › #4 › title",
  },
  capabilitiesItems3Body: {
    defaultMessage: "Write variants with your glossary and brand voice built in.",
    id: "AvVq2KTnVy",
    description: "market-experimentation use case page: capabilities › items › #4 › body",
  },
  capabilitiesItems4Title: {
    defaultMessage: "Clear results",
    id: "ckyBEf9Wig",
    description: "market-experimentation use case page: capabilities › items › #5 › title",
  },
  capabilitiesItems4Body: {
    defaultMessage: "See which version wins in each market, and by how much.",
    id: "07hLkJhLSW",
    description: "market-experimentation use case page: capabilities › items › #5 › body",
  },
  capabilitiesItems5Title: {
    defaultMessage: "Quick rollout",
    id: "+UyvHFktu/",
    description: "market-experimentation use case page: capabilities › items › #6 › title",
  },
  capabilitiesItems5Body: {
    defaultMessage: "Take a winning version to the next market without rebuilding it.",
    id: "KCxDd2SVw7",
    description: "market-experimentation use case page: capabilities › items › #6 › body",
  },
  scenarioTitle: {
    defaultMessage: "A checkout test in Japan becomes a win in Korea",
    id: "KJB+hJ9sBt",
    description: "market-experimentation use case page: scenario › title",
  },
  scenarioBody: {
    defaultMessage: "How a growth team turns one market insight into results across a region.",
    id: "fkx0noYqDJ",
    description: "market-experimentation use case page: scenario › body",
  },
  scenarioEvents0Time: {
    defaultMessage: "Day 1",
    id: "oeUxaO8IRx",
    description: "market-experimentation use case page: scenario › events › #1 › time",
  },
  scenarioEvents0Title: {
    defaultMessage: "A hypothesis",
    id: "vcxvAZztfg",
    description: "market-experimentation use case page: scenario › events › #1 › title",
  },
  scenarioEvents0Body: {
    defaultMessage:
      "Visitors in Japan abandon checkout more than anywhere else. The team suspects payment trust.",
    id: "4Lfu8t2HQ8",
    description: "market-experimentation use case page: scenario › events › #1 › body",
  },
  scenarioEvents1Time: {
    defaultMessage: "Day 2",
    id: "vS1K15Dmc1",
    description: "market-experimentation use case page: scenario › events › #2 › time",
  },
  scenarioEvents1Title: {
    defaultMessage: "A local variant",
    id: "NoA3ZmMB1T",
    description: "market-experimentation use case page: scenario › events › #2 › title",
  },
  scenarioEvents1Body: {
    defaultMessage:
      "A new headline highlights local payment options. Only visitors in Japan see it.",
    id: "nLuqCbET1H",
    description: "market-experimentation use case page: scenario › events › #2 › body",
  },
  scenarioEvents2Time: {
    defaultMessage: "Day 14",
    id: "dTNNneuHqy",
    description: "market-experimentation use case page: scenario › events › #3 › time",
  },
  scenarioEvents2Title: {
    defaultMessage: "A clear winner",
    id: "2LozQlleKp",
    description: "market-experimentation use case page: scenario › events › #3 › title",
  },
  scenarioEvents2Body: {
    defaultMessage: "The local variant lifts completed checkouts. The team keeps it in Japan.",
    id: "7SMbe2XYbL",
    description: "market-experimentation use case page: scenario › events › #3 › body",
  },
  scenarioEvents3Time: {
    defaultMessage: "Day 15",
    id: "XyWTUw82WS",
    description: "market-experimentation use case page: scenario › events › #4 › time",
  },
  scenarioEvents3Title: {
    defaultMessage: "The next market",
    id: "A+gMK4lLRO",
    description: "market-experimentation use case page: scenario › events › #4 › title",
  },
  scenarioEvents3Body: {
    defaultMessage:
      "The same idea is adapted for Korea and launched as a new test, with no new engineering work.",
    id: "7FcKwKURVD",
    description: "market-experimentation use case page: scenario › events › #4 › body",
  },
  ctaHeadline: {
    defaultMessage: "Find out what each market wants",
    id: "I2HgBtrE18",
    description: "market-experimentation use case page: cta › headline",
  },
  ctaBody: {
    defaultMessage:
      "Start a free workspace or book a demo, and run your first market experiment next to your localised content.",
    id: "8Kggwf9qsX",
    description: "market-experimentation use case page: cta › body",
  },
});

export const marketExperimentationStory: UseCaseStory = {
  slug: "market-experimentation",
  hero: {
    headline: m.heroHeadline,
    body: m.heroBody,
    visual: {
      kind: "hyperlab",
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
          kind: "checklist",
          title: m.guideSteps0VisualTitle,
          subtitle: m.guideSteps0VisualSubtitle,
          items: [
            {
              label: m.guideSteps0VisualItems0Label,
              meta: m.guideSteps0VisualItems0Meta,
              status: "done",
            },
            {
              label: m.guideSteps0VisualItems1Label,
              meta: m.guideSteps0VisualItems1Meta,
              status: "done",
            },
            {
              label: m.guideSteps0VisualItems2Label,
              meta: m.guideSteps0VisualItems2Meta,
              status: "done",
            },
            {
              label: m.guideSteps0VisualItems3Label,
              meta: m.guideSteps0VisualItems3Meta,
              status: "done",
            },
          ],
        },
      },
      {
        title: m.guideSteps1Title,
        body: m.guideSteps1Body,
        visual: {
          kind: "creative",
          title: m.guideSteps1VisualTitle,
          variants: [
            {
              locale: "ja-JP",
              headline: "安全なお支払い",
              body: "クレジットカードで今すぐ購入",
              status: "done",
              note: m.guideSteps1VisualVariants0Note,
            },
            {
              locale: "ja-JP",
              headline: "コンビニ払い・後払いにも対応",
              body: "お好きな方法で、安心してお支払い",
              status: "running",
              note: m.guideSteps1VisualVariants1Note,
            },
          ],
        },
      },
      {
        title: m.guideSteps2Title,
        body: m.guideSteps2Body,
        visual: {
          kind: "metrics",
          title: m.guideSteps2VisualTitle,
          subtitle: m.guideSteps2VisualSubtitle,
          metrics: [
            {
              label: m.guideSteps2VisualMetrics0Label,
              value: "3.1%",
              tone: "neutral",
            },
            {
              label: m.guideSteps2VisualMetrics1Label,
              value: "4.0%",
              delta: "+29%",
              tone: "good",
            },
            {
              label: m.guideSteps2VisualMetrics2Label,
              value: "96%",
              tone: "neutral",
            },
          ],
        },
      },
      {
        title: m.guideSteps3Title,
        body: m.guideSteps3Body,
        visual: {
          kind: "locales",
          title: m.guideSteps3VisualTitle,
          subtitle: m.guideSteps3VisualSubtitle,
          locales: [
            {
              code: "ja-JP",
              progress: 100,
              status: "done",
              note: m.guideSteps3VisualLocales0Note,
            },
            {
              code: "ko-KR",
              progress: 50,
              status: "running",
              note: m.guideSteps3VisualLocales1Note,
            },
            {
              code: "zh-TW",
              progress: 0,
              status: "todo",
              note: m.guideSteps3VisualLocales2Note,
            },
          ],
        },
      },
    ],
  },
  integrations: {
    title: m.integrationsTitle,
    ids: ["github", "contentful", "hubspot", "figma", "slack", "openai", "anthropic", "gemini"],
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
