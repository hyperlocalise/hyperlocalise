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
    defaultMessage: "Keep every help article current in every language",
    id: "G6Ony81UlV",
    description: "help-center-localisation use case page: hero › headline",
  },
  heroBody: {
    defaultMessage:
      "When an English article changes, Hyperlocalise drafts the update, checks product terms, routes it to the right reviewer, and publishes it. Then it flags any locale that falls behind.",
    id: "N5Xc/xZfh8",
    description: "help-center-localisation use case page: hero › body",
  },
  heroVisualPrimaryTitle: {
    defaultMessage: "Update your billing details",
    id: "R4EiZK1dDQ",
    description: "help-center-localisation use case page: hero › visual › primary › title",
  },
  heroVisualPrimarySubtitle: {
    defaultMessage: "Edited in English 2 hours ago",
    id: "HNbrsDJVdQ",
    description: "help-center-localisation use case page: hero › visual › primary › subtitle",
  },
  heroVisualPrimaryLocales0Note: {
    defaultMessage: "Up to date",
    id: "TViRJtMGI6",
    description:
      "help-center-localisation use case page: hero › visual › primary › locales › #1 › note",
  },
  heroVisualPrimaryLocales1Note: {
    defaultMessage: "Up to date",
    id: "U5XeL6tqyB",
    description:
      "help-center-localisation use case page: hero › visual › primary › locales › #2 › note",
  },
  heroVisualPrimaryLocales2Note: {
    defaultMessage: "Updating",
    id: "AjBUPYOEDl",
    description:
      "help-center-localisation use case page: hero › visual › primary › locales › #3 › note",
  },
  heroVisualPrimaryLocales3Note: {
    defaultMessage: "2 versions behind",
    id: "XyeB8BzsGz",
    description:
      "help-center-localisation use case page: hero › visual › primary › locales › #4 › note",
  },
  heroVisualPrimaryLocales4Note: {
    defaultMessage: "Up to date",
    id: "MRDxmOYEJ2",
    description:
      "help-center-localisation use case page: hero › visual › primary › locales › #5 › note",
  },
  heroVisualPrimaryLocales5Note: {
    defaultMessage: "Up to date",
    id: "SEG1b444sD",
    description:
      "help-center-localisation use case page: hero › visual › primary › locales › #6 › note",
  },
  heroVisualFloatingTitle: {
    defaultMessage: "#support-content",
    id: "urmzJ2pvbz",
    description: "help-center-localisation use case page: hero › visual › floating › title",
  },
  heroVisualFloatingMessages0Text: {
    defaultMessage: "Which help articles are out of date in Japanese?",
    id: "H0a/BAUJag",
    description:
      "help-center-localisation use case page: hero › visual › floating › messages › #1 › text",
  },
  heroVisualFloatingMessages1Text: {
    defaultMessage:
      "Three changed in English this week. Two are in review and one is waiting for a new screenshot.",
    id: "drGYqrShww",
    description:
      "help-center-localisation use case page: hero › visual › floating › messages › #2 › text",
  },
  shiftTitle: {
    defaultMessage: "From stale translations to answers customers trust",
    id: "l04bzMI2mh",
    description: "help-center-localisation use case page: shift › title",
  },
  shiftBefore0: {
    defaultMessage: "English articles change every week. Translations lag weeks behind.",
    id: "XkRPJWBwWG",
    description: "help-center-localisation use case page: shift › before › #1",
  },
  shiftBefore1: {
    defaultMessage: "Nobody knows which locales are out of date until a ticket comes in.",
    id: "/heVApJ8Dq",
    description: "help-center-localisation use case page: shift › before › #2",
  },
  shiftBefore2: {
    defaultMessage: "Every update means a full retranslation and another vendor invoice.",
    id: "PzZlpZThpJ",
    description: "help-center-localisation use case page: shift › before › #3",
  },
  shiftAfter0: {
    defaultMessage: "Changes are picked up the moment an article is updated.",
    id: "vG3B5MYPgU",
    description: "help-center-localisation use case page: shift › after › #1",
  },
  shiftAfter1: {
    defaultMessage: "Only the changed sections are translated and reviewed.",
    id: "q/Tgs6Yd+2",
    description: "help-center-localisation use case page: shift › after › #2",
  },
  shiftAfter2: {
    defaultMessage: "A freshness view shows every locale that is behind, and why.",
    id: "OKShz/MD4b",
    description: "help-center-localisation use case page: shift › after › #3",
  },
  guideTitle: {
    defaultMessage: "From article update to every locale, automatically",
    id: "lNe85ZoVH7",
    description: "help-center-localisation use case page: guide › title",
  },
  guideBody: {
    defaultMessage:
      "Connect your help center once. Every update after that flows through the same steps.",
    id: "yRdc2YkkZ2",
    description: "help-center-localisation use case page: guide › body",
  },
  guideSteps0Title: {
    defaultMessage: "Detect the change",
    id: "8rEgGjdW4Y",
    description: "help-center-localisation use case page: guide › steps › #1 › title",
  },
  guideSteps0Body: {
    defaultMessage:
      "Hyperlocalise watches Zendesk, Intercom, or Contentful and picks up new and edited articles as they are published.",
    id: "8qCKpLf5RT",
    description: "help-center-localisation use case page: guide › steps › #1 › body",
  },
  guideSteps0VisualTitle: {
    defaultMessage: "Changed this week",
    id: "zPH8g4Qd/F",
    description: "help-center-localisation use case page: guide › steps › #1 › visual › title",
  },
  guideSteps0VisualSubtitle: {
    defaultMessage: "Help center · English",
    id: "i0E55OlP+S",
    description: "help-center-localisation use case page: guide › steps › #1 › visual › subtitle",
  },
  guideSteps0VisualItems0Label: {
    defaultMessage: "Update your billing details",
    id: "MT0KIkiI9d",
    description:
      "help-center-localisation use case page: guide › steps › #1 › visual › items › #1 › label",
  },
  guideSteps0VisualItems0Meta: {
    defaultMessage: "Edited · 2 sections",
    id: "4u6/M/D7cV",
    description:
      "help-center-localisation use case page: guide › steps › #1 › visual › items › #1 › meta",
  },
  guideSteps0VisualItems1Label: {
    defaultMessage: "Set up single sign-on",
    id: "vUjSpZr77C",
    description:
      "help-center-localisation use case page: guide › steps › #1 › visual › items › #2 › label",
  },
  guideSteps0VisualItems1Meta: {
    defaultMessage: "New article",
    id: "05lA9Ggabv",
    description:
      "help-center-localisation use case page: guide › steps › #1 › visual › items › #2 › meta",
  },
  guideSteps0VisualItems2Label: {
    defaultMessage: "Export your data",
    id: "9UrRl3AzZR",
    description:
      "help-center-localisation use case page: guide › steps › #1 › visual › items › #3 › label",
  },
  guideSteps0VisualItems2Meta: {
    defaultMessage: "Edited · 1 section",
    id: "d+QiYZ+RYh",
    description:
      "help-center-localisation use case page: guide › steps › #1 › visual › items › #3 › meta",
  },
  guideSteps1Title: {
    defaultMessage: "Translate only what changed",
    id: "rr+DXMbrug",
    description: "help-center-localisation use case page: guide › steps › #2 › title",
  },
  guideSteps1Body: {
    defaultMessage:
      "Changed sections are drafted with your glossary and product UI labels, so instructions match what customers see in the app.",
    id: "I+PnVz1uJd",
    description: "help-center-localisation use case page: guide › steps › #2 › body",
  },
  guideSteps1VisualTitle: {
    defaultMessage: "Draft",
    id: "+3RA79RJsm",
    description: "help-center-localisation use case page: guide › steps › #2 › visual › title",
  },
  guideSteps1VisualSubtitle: {
    defaultMessage: "Update your billing details · Japanese",
    id: "dlXjXGl1A/",
    description: "help-center-localisation use case page: guide › steps › #2 › visual › subtitle",
  },
  guideSteps1VisualRows1Note: {
    defaultMessage: "Matches the label in the app",
    id: "wnwUcIHlus",
    description:
      "help-center-localisation use case page: guide › steps › #2 › visual › rows › #2 › note",
  },
  guideSteps2Title: {
    defaultMessage: "Review with support",
    id: "V61cSDrhV5",
    description: "help-center-localisation use case page: guide › steps › #3 › title",
  },
  guideSteps2Body: {
    defaultMessage:
      "Support leads and linguists review next to the English changes, then approve in one click.",
    id: "RB0ATs5nVb",
    description: "help-center-localisation use case page: guide › steps › #3 › body",
  },
  guideSteps2VisualTitle: {
    defaultMessage: "#support-content",
    id: "tpBd2pIxtu",
    description: "help-center-localisation use case page: guide › steps › #3 › visual › title",
  },
  guideSteps2VisualMessages0Text: {
    defaultMessage: "Can someone check the Spanish single sign-on article before it goes live?",
    id: "V36xPCsjnF",
    description:
      "help-center-localisation use case page: guide › steps › #3 › visual › messages › #1 › text",
  },
  guideSteps2VisualMessages1Text: {
    defaultMessage:
      "Assigned to María on the support team. Her review link shows the English changes and the glossary terms.",
    id: "jdyjfwq3ZY",
    description:
      "help-center-localisation use case page: guide › steps › #3 › visual › messages › #2 › text",
  },
  guideSteps3Title: {
    defaultMessage: "Publish and monitor freshness",
    id: "oqsKikE/zc",
    description: "help-center-localisation use case page: guide › steps › #4 › title",
  },
  guideSteps3Body: {
    defaultMessage:
      "Approved translations publish back to your help center. The freshness view flags any locale that falls behind.",
    id: "h8XP6tYan4",
    description: "help-center-localisation use case page: guide › steps › #4 › body",
  },
  guideSteps3VisualTitle: {
    defaultMessage: "Help center freshness",
    id: "z+cw+XR/SP",
    description: "help-center-localisation use case page: guide › steps › #4 › visual › title",
  },
  guideSteps3VisualSubtitle: {
    defaultMessage: "128 articles · 6 locales",
    id: "ofc7Dwq/rn",
    description: "help-center-localisation use case page: guide › steps › #4 › visual › subtitle",
  },
  guideSteps3VisualLocales3Note: {
    defaultMessage: "6 articles behind",
    id: "bGafpU6o5g",
    description:
      "help-center-localisation use case page: guide › steps › #4 › visual › locales › #4 › note",
  },
  integrationsTitle: {
    defaultMessage: "Plugs into your help center and support stack",
    id: "Wwotwp04Ui",
    description: "help-center-localisation use case page: integrations › title",
  },
  capabilitiesTitle: {
    defaultMessage: "Built for support content that never stops changing",
    id: "pT+rLLU/Bf",
    description: "help-center-localisation use case page: capabilities › title",
  },
  capabilitiesItems0Title: {
    defaultMessage: "Help center connectors",
    id: "/2dw2O8PoQ",
    description: "help-center-localisation use case page: capabilities › items › #1 › title",
  },
  capabilitiesItems0Body: {
    defaultMessage: "Sync with Zendesk, Intercom, Contentful, and other content platforms.",
    id: "OduvTHBp7/",
    description: "help-center-localisation use case page: capabilities › items › #1 › body",
  },
  capabilitiesItems1Title: {
    defaultMessage: "Section-level updates",
    id: "8902wmgyfl",
    description: "help-center-localisation use case page: capabilities › items › #2 › title",
  },
  capabilitiesItems1Body: {
    defaultMessage: "Translate only what changed, so updates are fast and affordable.",
    id: "liHJafs526",
    description: "help-center-localisation use case page: capabilities › items › #2 › body",
  },
  capabilitiesItems2Title: {
    defaultMessage: "Product-aware terminology",
    id: "318tPJfswe",
    description: "help-center-localisation use case page: capabilities › items › #3 › title",
  },
  capabilitiesItems2Body: {
    defaultMessage: "Match UI labels and product terms so instructions line up with the app.",
    id: "QMh6yY0nNA",
    description: "help-center-localisation use case page: capabilities › items › #3 › body",
  },
  capabilitiesItems3Title: {
    defaultMessage: "Support reviewer workflows",
    id: "7a8IO25k+o",
    description: "help-center-localisation use case page: capabilities › items › #4 › title",
  },
  capabilitiesItems3Body: {
    defaultMessage:
      "Route reviews to support leads and linguists with the English changes attached.",
    id: "V/s/hmHXUQ",
    description: "help-center-localisation use case page: capabilities › items › #4 › body",
  },
  capabilitiesItems4Title: {
    defaultMessage: "Freshness monitoring",
    id: "CFAESo/VUK",
    description: "help-center-localisation use case page: capabilities › items › #5 › title",
  },
  capabilitiesItems4Body: {
    defaultMessage: "See which articles are behind in every locale, and by how much.",
    id: "vajjGr6HsP",
    description: "help-center-localisation use case page: capabilities › items › #5 › body",
  },
  capabilitiesItems5Title: {
    defaultMessage: "Automatic publishing",
    id: "z6tomvR8qf",
    description: "help-center-localisation use case page: capabilities › items › #6 › title",
  },
  capabilitiesItems5Body: {
    defaultMessage:
      "Publish approved translations back to your help center without copy and paste.",
    id: "9fQig1Dm8L",
    description: "help-center-localisation use case page: capabilities › items › #6 › body",
  },
  scenarioTitle: {
    defaultMessage: "A billing change reaches twelve locales the same day",
    id: "IFKnGP8d9L",
    description: "help-center-localisation use case page: scenario › title",
  },
  scenarioBody: {
    defaultMessage:
      "How a support team keeps a high-traffic article accurate everywhere after a pricing update.",
    id: "UNJd7KSdJ/",
    description: "help-center-localisation use case page: scenario › body",
  },
  scenarioEvents0Time: {
    defaultMessage: "10:00",
    id: "0aq4incgpK",
    description: "help-center-localisation use case page: scenario › events › #1 › time",
  },
  scenarioEvents0Title: {
    defaultMessage: "Billing changes",
    id: "TMZwJfjnDx",
    description: "help-center-localisation use case page: scenario › events › #1 › title",
  },
  scenarioEvents0Body: {
    defaultMessage: "The billing team updates the English article with new plan names and steps.",
    id: "gzF/q50Qtp",
    description: "help-center-localisation use case page: scenario › events › #1 › body",
  },
  scenarioEvents1Time: {
    defaultMessage: "10:01",
    id: "RrbAwdI0dk",
    description: "help-center-localisation use case page: scenario › events › #2 › time",
  },
  scenarioEvents1Title: {
    defaultMessage: "The change is picked up",
    id: "9bqzdiYzYI",
    description: "help-center-localisation use case page: scenario › events › #2 › title",
  },
  scenarioEvents1Body: {
    defaultMessage:
      "Hyperlocalise drafts the two edited sections in twelve locales using the product glossary.",
    id: "HDUb3fboOf",
    description: "help-center-localisation use case page: scenario › events › #2 › body",
  },
  scenarioEvents2Time: {
    defaultMessage: "13:00",
    id: "0mseF8Iay7",
    description: "help-center-localisation use case page: scenario › events › #3 › time",
  },
  scenarioEvents2Title: {
    defaultMessage: "Support reviews",
    id: "U2XhOfxWAb",
    description: "help-center-localisation use case page: scenario › events › #3 › title",
  },
  scenarioEvents2Body: {
    defaultMessage: "Support leads in each region review the drafts next to the English changes.",
    id: "5ax8wShRw3",
    description: "help-center-localisation use case page: scenario › events › #3 › body",
  },
  scenarioEvents3Time: {
    defaultMessage: "16:00",
    id: "BpE4tSpcJJ",
    description: "help-center-localisation use case page: scenario › events › #4 › time",
  },
  scenarioEvents3Title: {
    defaultMessage: "Every locale is live",
    id: "v70Y2kTioa",
    description: "help-center-localisation use case page: scenario › events › #4 › title",
  },
  scenarioEvents3Body: {
    defaultMessage:
      "Approved articles publish to the help center. The freshness view shows all twelve locales up to date.",
    id: "nu7jJak54Y",
    description: "help-center-localisation use case page: scenario › events › #4 › body",
  },
  ctaHeadline: {
    defaultMessage: "Answer every customer in their own language",
    id: "isMfQuGldU",
    description: "help-center-localisation use case page: cta › headline",
  },
  ctaBody: {
    defaultMessage:
      "Start a free workspace or book a demo, and see your next article update reach every locale in hours instead of weeks.",
    id: "+NsjaCC9pk",
    description: "help-center-localisation use case page: cta › body",
  },
});

export const helpCenterLocalisationStory: UseCaseStory = {
  slug: "help-center-localisation",
  hero: {
    headline: m.heroHeadline,
    body: m.heroBody,
    visual: {
      kind: "composition",
      primary: {
        kind: "locales",
        title: m.heroVisualPrimaryTitle,
        subtitle: m.heroVisualPrimarySubtitle,
        locales: [
          {
            code: "de-DE",
            progress: 100,
            status: "done",
            note: m.heroVisualPrimaryLocales0Note,
          },
          {
            code: "fr-FR",
            progress: 100,
            status: "done",
            note: m.heroVisualPrimaryLocales1Note,
          },
          {
            code: "ja-JP",
            progress: 60,
            status: "running",
            note: m.heroVisualPrimaryLocales2Note,
          },
          {
            code: "es-ES",
            progress: 30,
            status: "warn",
            note: m.heroVisualPrimaryLocales3Note,
          },
          {
            code: "pt-BR",
            progress: 100,
            status: "done",
            note: m.heroVisualPrimaryLocales4Note,
          },
          {
            code: "ko-KR",
            progress: 100,
            status: "done",
            note: m.heroVisualPrimaryLocales5Note,
          },
        ],
      },
      floating: {
        kind: "chat",
        client: "slack",
        title: m.heroVisualFloatingTitle,
        messages: [
          {
            from: "user",
            text: m.heroVisualFloatingMessages0Text,
          },
          {
            from: "agent",
            text: m.heroVisualFloatingMessages1Text,
          },
        ],
      },
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
          ],
        },
      },
      {
        title: m.guideSteps1Title,
        body: m.guideSteps1Body,
        visual: {
          kind: "strings",
          title: m.guideSteps1VisualTitle,
          subtitle: m.guideSteps1VisualSubtitle,
          rows: [
            {
              key: "billing.step2",
              source: "Open Settings, then select Billing.",
              target: "「設定」を開き、「請求」を選択します。",
              locale: "ja-JP",
              status: "done",
            },
            {
              key: "billing.step3",
              source: "Choose Update card.",
              target: "「カードを更新」を選択します。",
              locale: "ja-JP",
              status: "done",
              note: m.guideSteps1VisualRows1Note,
            },
          ],
        },
      },
      {
        title: m.guideSteps2Title,
        body: m.guideSteps2Body,
        visual: {
          kind: "chat",
          client: "slack",
          title: m.guideSteps2VisualTitle,
          messages: [
            {
              from: "user",
              text: m.guideSteps2VisualMessages0Text,
            },
            {
              from: "agent",
              text: m.guideSteps2VisualMessages1Text,
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
              code: "de-DE",
              progress: 100,
              status: "done",
            },
            {
              code: "fr-FR",
              progress: 98,
              status: "done",
            },
            {
              code: "ja-JP",
              progress: 91,
              status: "running",
            },
            {
              code: "es-ES",
              progress: 84,
              status: "warn",
              note: m.guideSteps3VisualLocales3Note,
            },
            {
              code: "pt-BR",
              progress: 97,
              status: "done",
            },
            {
              code: "ko-KR",
              progress: 95,
              status: "done",
            },
          ],
        },
      },
    ],
  },
  integrations: {
    title: m.integrationsTitle,
    ids: ["intercom", "contentful", "slack", "teams", "phrase", "lokalise", "openai", "anthropic"],
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
