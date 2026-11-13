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
    defaultMessage: "Catch translation issues before your customers do",
    id: "WgLAzA3vxA",
    description: "localisation-quality-monitoring use case page: hero › headline",
  },
  heroBody: {
    defaultMessage:
      "Turn your brand guide, glossary, and market rules into checks that run on every translation. Problems are flagged before content syncs, not after a customer reports them.",
    id: "c2wp+BTrds",
    description: "localisation-quality-monitoring use case page: hero › body",
  },
  shiftTitle: {
    defaultMessage: "From spot checks to quality on every string",
    id: "D2aA54r5S+",
    description: "localisation-quality-monitoring use case page: shift › title",
  },
  shiftBefore0: {
    defaultMessage: "Brand guides sit in a PDF that reviewers may never open.",
    id: "W7R73EVRjM",
    description: "localisation-quality-monitoring use case page: shift › before › #1",
  },
  shiftBefore1: {
    defaultMessage: "Glossary breaks and tone drift surface weeks later in production.",
    id: "EYnvL3SJKu",
    description: "localisation-quality-monitoring use case page: shift › before › #2",
  },
  shiftBefore2: {
    defaultMessage: "Quality is a feeling, so you cannot show it to leadership.",
    id: "lcfHyzWzQ5",
    description: "localisation-quality-monitoring use case page: shift › before › #3",
  },
  shiftAfter0: {
    defaultMessage: "Your guidelines become checks that run on every string, in every locale.",
    id: "elcQCWL95U",
    description: "localisation-quality-monitoring use case page: shift › after › #1",
  },
  shiftAfter1: {
    defaultMessage: "Issues are caught before sync, with the rule and a suggested fix attached.",
    id: "ajwsrqGqra",
    description: "localisation-quality-monitoring use case page: shift › after › #2",
  },
  shiftAfter2: {
    defaultMessage: "Quality scores by locale, vendor, and content type, tracked over time.",
    id: "xXi7rFWRDl",
    description: "localisation-quality-monitoring use case page: shift › after › #3",
  },
  guideTitle: {
    defaultMessage: "Your guidelines, enforced on every translation",
    id: "8+FJcxte6t",
    description: "localisation-quality-monitoring use case page: guide › title",
  },
  guideBody: {
    defaultMessage:
      "Bring the documents you already have. Hyperlocalise turns them into rules and applies them wherever content is created.",
    id: "IOYCdoQGww",
    description: "localisation-quality-monitoring use case page: guide › body",
  },
  guideSteps0Title: {
    defaultMessage: "Import your guidelines",
    id: "trfEkJX1W1",
    description: "localisation-quality-monitoring use case page: guide › steps › #1 › title",
  },
  guideSteps0Body: {
    defaultMessage:
      "Connect Google Drive, Notion, or SharePoint, or type rules in. Brand voice, glossaries, and market rules become structured checks.",
    id: "08B32QIArh",
    description: "localisation-quality-monitoring use case page: guide › steps › #1 › body",
  },
  guideSteps0VisualTitle: {
    defaultMessage: "Guidelines",
    id: "cKbx+L1bVT",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #1 › visual › title",
  },
  guideSteps0VisualSubtitle: {
    defaultMessage: "4 sources",
    id: "C0d1o5RP+0",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #1 › visual › subtitle",
  },
  guideSteps0VisualItems0Label: {
    defaultMessage: "Brand voice guide",
    id: "R6PjQ8pd20",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #1 › visual › items › #1 › label",
  },
  guideSteps0VisualItems0Meta: {
    defaultMessage: "Notion · 24 rules",
    id: "qZ1+XnvVp0",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #1 › visual › items › #1 › meta",
  },
  guideSteps0VisualItems1Label: {
    defaultMessage: "Product glossary",
    id: "DHfeoWU3ph",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #1 › visual › items › #2 › label",
  },
  guideSteps0VisualItems1Meta: {
    defaultMessage: "CSV · 1,240 terms",
    id: "uCgrc/OrPe",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #1 › visual › items › #2 › meta",
  },
  guideSteps0VisualItems2Label: {
    defaultMessage: "Japan market rules",
    id: "RV2Es95MR1",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #1 › visual › items › #3 › label",
  },
  guideSteps0VisualItems2Meta: {
    defaultMessage: "SharePoint · 9 rules",
    id: "VlxPeS1msU",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #1 › visual › items › #3 › meta",
  },
  guideSteps0VisualItems3Label: {
    defaultMessage: "EU legal disclaimers",
    id: "D9BIb3qTSC",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #1 › visual › items › #4 › label",
  },
  guideSteps0VisualItems3Meta: {
    defaultMessage: "Google Drive · syncing",
    id: "Ekttc96ASG",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #1 › visual › items › #4 › meta",
  },
  guideSteps1Title: {
    defaultMessage: "Check every translation",
    id: "XK1kxY8UHn",
    description: "localisation-quality-monitoring use case page: guide › steps › #2 › title",
  },
  guideSteps1Body: {
    defaultMessage:
      "Each string is checked for terminology, tone, length limits, placeholders, and market rules before it moves on.",
    id: "5F+OdtKPNI",
    description: "localisation-quality-monitoring use case page: guide › steps › #2 › body",
  },
  guideSteps1VisualTitle: {
    defaultMessage: "Quality check",
    id: "0YwcSbEeb2",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #2 › visual › title",
  },
  guideSteps1VisualSubtitle: {
    defaultMessage: "Spring release · German",
    id: "0KlckQA/kO",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #2 › visual › subtitle",
  },
  guideSteps1VisualRows1Note: {
    defaultMessage: "Glossary: use the approved plan name",
    id: "3SoIwUNuCC",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #2 › visual › rows › #2 › note",
  },
  guideSteps1VisualRows2Note: {
    defaultMessage: "The discount placeholder is missing",
    id: "fqrCMahtmI",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #2 › visual › rows › #3 › note",
  },
  guideSteps2Title: {
    defaultMessage: "Fix with context",
    id: "PScpvnievX",
    description: "localisation-quality-monitoring use case page: guide › steps › #3 › title",
  },
  guideSteps2Body: {
    defaultMessage:
      "Reviewers see the rule, the source, and a suggested fix together, so corrections take seconds instead of a round trip.",
    id: "f+tt58ZoOP",
    description: "localisation-quality-monitoring use case page: guide › steps › #3 › body",
  },
  guideSteps2VisualTitle: {
    defaultMessage: "#loc-quality",
    id: "aZZCkQKUK9",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #3 › visual › title",
  },
  guideSteps2VisualMessages0Text: {
    defaultMessage: "Why was the German promo banner blocked?",
    id: "X5z8irUEZg",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #3 › visual › messages › #1 › text",
  },
  guideSteps2VisualMessages1Text: {
    defaultMessage:
      "The translation dropped the discount placeholder, so the price would not show. I have suggested a fix for review.",
    id: "PuhIg+8YHC",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #3 › visual › messages › #2 › text",
  },
  guideSteps3Title: {
    defaultMessage: "Track quality over time",
    id: "o7POJlesMI",
    description: "localisation-quality-monitoring use case page: guide › steps › #4 › title",
  },
  guideSteps3Body: {
    defaultMessage:
      "Scores by locale, vendor, and content type show where quality is improving and where it needs attention.",
    id: "mCnafIaZsK",
    description: "localisation-quality-monitoring use case page: guide › steps › #4 › body",
  },
  guideSteps3VisualTitle: {
    defaultMessage: "Quality this quarter",
    id: "MfSGxtQAO0",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #4 › visual › title",
  },
  guideSteps3VisualMetrics0Label: {
    defaultMessage: "Quality score",
    id: "herDZN/GbR",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #4 › visual › metrics › #1 › label",
  },
  guideSteps3VisualMetrics1Label: {
    defaultMessage: "Glossary breaks",
    id: "JnnRDzuWA2",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #4 › visual › metrics › #2 › label",
  },
  guideSteps3VisualMetrics2Label: {
    defaultMessage: "Caught before sync",
    id: "Ea9yDlBOkl",
    description:
      "localisation-quality-monitoring use case page: guide › steps › #4 › visual › metrics › #3 › label",
  },
  integrationsTitle: {
    defaultMessage: "Reads the guidelines you already have",
    id: "7MzARgc1Gh",
    description: "localisation-quality-monitoring use case page: integrations › title",
  },
  capabilitiesTitle: {
    defaultMessage: "Quality you can see and prove",
    id: "e+uHL/yEUk",
    description: "localisation-quality-monitoring use case page: capabilities › title",
  },
  capabilitiesItems0Title: {
    defaultMessage: "Guidelines from your documents",
    id: "m5g1uFAlkr",
    description: "localisation-quality-monitoring use case page: capabilities › items › #1 › title",
  },
  capabilitiesItems0Body: {
    defaultMessage:
      "Import brand guides, glossaries, and style rules from Drive, Notion, or SharePoint.",
    id: "2xXc5WfOLf",
    description: "localisation-quality-monitoring use case page: capabilities › items › #1 › body",
  },
  capabilitiesItems1Title: {
    defaultMessage: "Terminology enforcement",
    id: "blSZCCTmMt",
    description: "localisation-quality-monitoring use case page: capabilities › items › #2 › title",
  },
  capabilitiesItems1Body: {
    defaultMessage: "Flag forbidden and outdated terms, and suggest the approved one.",
    id: "gSqK18q6KY",
    description: "localisation-quality-monitoring use case page: capabilities › items › #2 › body",
  },
  capabilitiesItems2Title: {
    defaultMessage: "Tone and voice checks",
    id: "LQeArm5IJg",
    description: "localisation-quality-monitoring use case page: capabilities › items › #3 › title",
  },
  capabilitiesItems2Body: {
    defaultMessage: "Compare every translation with your brand voice for each market.",
    id: "7XC8dqOFfJ",
    description: "localisation-quality-monitoring use case page: capabilities › items › #3 › body",
  },
  capabilitiesItems3Title: {
    defaultMessage: "Technical checks",
    id: "0ELD0bADWs",
    description: "localisation-quality-monitoring use case page: capabilities › items › #4 › title",
  },
  capabilitiesItems3Body: {
    defaultMessage:
      "Catch broken placeholders, tags, length limits, and formatting before release.",
    id: "VwRaJ1wu1E",
    description: "localisation-quality-monitoring use case page: capabilities › items › #4 › body",
  },
  capabilitiesItems4Title: {
    defaultMessage: "Quality gates",
    id: "00D98w/DJ3",
    description: "localisation-quality-monitoring use case page: capabilities › items › #5 › title",
  },
  capabilitiesItems4Body: {
    defaultMessage: "Block a sync or release until the issues that matter are fixed.",
    id: "RGnEVhYOOW",
    description: "localisation-quality-monitoring use case page: capabilities › items › #5 › body",
  },
  capabilitiesItems5Title: {
    defaultMessage: "Quality reporting",
    id: "14345AQFJX",
    description: "localisation-quality-monitoring use case page: capabilities › items › #6 › title",
  },
  capabilitiesItems5Body: {
    defaultMessage: "Track scores by locale, vendor, and content type over time.",
    id: "6Tx/kR6Gl+",
    description: "localisation-quality-monitoring use case page: capabilities › items › #6 › body",
  },
  scenarioTitle: {
    defaultMessage: "A product rename reaches every locale without a manual hunt",
    id: "SlKb2Gnc7G",
    description: "localisation-quality-monitoring use case page: scenario › title",
  },
  scenarioBody: {
    defaultMessage:
      "How one glossary change rolls out across product, marketing, and support content.",
    id: "2n/7IRWVVW",
    description: "localisation-quality-monitoring use case page: scenario › body",
  },
  scenarioEvents0Time: {
    defaultMessage: "Tuesday 10:00",
    id: "fcipZWZ/+h",
    description: "localisation-quality-monitoring use case page: scenario › events › #1 › time",
  },
  scenarioEvents0Title: {
    defaultMessage: "The plan gets a new name",
    id: "RoKBC0r935",
    description: "localisation-quality-monitoring use case page: scenario › events › #1 › title",
  },
  scenarioEvents0Body: {
    defaultMessage: "Marketing renames a pricing plan. The glossary is updated once.",
    id: "8G78rLHnPB",
    description: "localisation-quality-monitoring use case page: scenario › events › #1 › body",
  },
  scenarioEvents1Time: {
    defaultMessage: "Tuesday 10:02",
    id: "86JsIRk3G3",
    description: "localisation-quality-monitoring use case page: scenario › events › #2 › time",
  },
  scenarioEvents1Title: {
    defaultMessage: "Every locale is rechecked",
    id: "bTrnaoiKXQ",
    description: "localisation-quality-monitoring use case page: scenario › events › #2 › title",
  },
  scenarioEvents1Body: {
    defaultMessage:
      "Hyperlocalise finds 214 strings across the app, help center, and campaigns that still use the old name.",
    id: "cG+WbGfiCj",
    description: "localisation-quality-monitoring use case page: scenario › events › #2 › body",
  },
  scenarioEvents2Time: {
    defaultMessage: "Tuesday 15:00",
    id: "TJy0UXI8lN",
    description: "localisation-quality-monitoring use case page: scenario › events › #3 › time",
  },
  scenarioEvents2Title: {
    defaultMessage: "Fixes go to review",
    id: "S7/U+TgcBm",
    description: "localisation-quality-monitoring use case page: scenario › events › #3 › title",
  },
  scenarioEvents2Body: {
    defaultMessage:
      "Suggested replacements are routed to each market's reviewer with the glossary change attached.",
    id: "qhIxGaybMx",
    description: "localisation-quality-monitoring use case page: scenario › events › #3 › body",
  },
  scenarioEvents3Time: {
    defaultMessage: "Thursday 11:00",
    id: "FeSwhvOicU",
    description: "localisation-quality-monitoring use case page: scenario › events › #4 › time",
  },
  scenarioEvents3Title: {
    defaultMessage: "Nothing slips through",
    id: "Dtz2jDuBau",
    description: "localisation-quality-monitoring use case page: scenario › events › #4 › title",
  },
  scenarioEvents3Body: {
    defaultMessage:
      "The quality gate blocks a late German banner with the old name. It is fixed before it ships.",
    id: "GO3LR/+/Sc",
    description: "localisation-quality-monitoring use case page: scenario › events › #4 › body",
  },
  ctaHeadline: {
    defaultMessage: "Know every translation is right before it ships",
    id: "LHcdBKMcVl",
    description: "localisation-quality-monitoring use case page: cta › headline",
  },
  ctaBody: {
    defaultMessage:
      "Start a free workspace or book a demo, and turn your guidelines into checks that run on every string.",
    id: "MuJU4r0u3C",
    description: "localisation-quality-monitoring use case page: cta › body",
  },
});

export const localisationQualityMonitoringStory: UseCaseStory = {
  slug: "localisation-quality-monitoring",
  hero: {
    headline: m.heroHeadline,
    body: m.heroBody,
    visual: {
      kind: "guidelines",
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
              status: "running",
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
              key: "checkout.cta",
              source: "Start your free trial",
              target: "Starte deine kostenlose Testversion",
              locale: "de-DE",
              status: "done",
            },
            {
              key: "billing.plan",
              source: "Team plan",
              target: "Arbeitsbereich-Tarif",
              locale: "de-DE",
              status: "warn",
              note: m.guideSteps1VisualRows1Note,
            },
            {
              key: "promo.banner",
              source: "Save {percent}% today",
              target: "Spare heute",
              locale: "de-DE",
              status: "error",
              note: m.guideSteps1VisualRows2Note,
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
          kind: "metrics",
          title: m.guideSteps3VisualTitle,
          metrics: [
            {
              label: m.guideSteps3VisualMetrics0Label,
              value: "94",
              delta: "+6",
              tone: "good",
            },
            {
              label: m.guideSteps3VisualMetrics1Label,
              value: "12",
              delta: "−41%",
              tone: "good",
            },
            {
              label: m.guideSteps3VisualMetrics2Label,
              value: "98%",
              tone: "neutral",
            },
          ],
          bars: [
            {
              label: "de-DE",
              value: 96,
            },
            {
              label: "fr-FR",
              value: 94,
            },
            {
              label: "ja-JP",
              value: 88,
            },
            {
              label: "pt-BR",
              value: 91,
            },
            {
              label: "ko-KR",
              value: 86,
            },
          ],
        },
      },
    ],
  },
  integrations: {
    title: m.integrationsTitle,
    ids: ["notion", "sharepoint", "figma", "phrase", "crowdin", "lokalise", "github", "slack"],
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
