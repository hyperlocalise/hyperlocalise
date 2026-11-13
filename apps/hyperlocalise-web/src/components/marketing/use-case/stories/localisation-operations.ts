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
    defaultMessage: "Run your whole localisation programme from one place",
    id: "+qDaNp7QrL",
    description: "localisation-operations use case page: hero › headline",
  },
  heroBody: {
    defaultMessage:
      "Bring requests, vendors, reviewers, AI models, and your TMS into one workflow. See what is in flight, what is blocked, and who owns it, without replacing the tools your team relies on.",
    id: "DKDir1VZcA",
    description: "localisation-operations use case page: hero › body",
  },
  heroVisualPrimaryTitle: {
    defaultMessage: "This week's requests",
    id: "KW+cTDzjgb",
    description: "localisation-operations use case page: hero › visual › primary › title",
  },
  heroVisualPrimarySubtitle: {
    defaultMessage: "4 streams · 14 locales",
    id: "QC3oZLICiS",
    description: "localisation-operations use case page: hero › visual › primary › subtitle",
  },
  heroVisualPrimaryItems0Label: {
    defaultMessage: "Spring release",
    id: "BegE9xzcgJ",
    description:
      "localisation-operations use case page: hero › visual › primary › items › #1 › label",
  },
  heroVisualPrimaryItems0Meta: {
    defaultMessage: "Product · 14 locales · due Friday",
    id: "LPQQXFUwyR",
    description:
      "localisation-operations use case page: hero › visual › primary › items › #1 › meta",
  },
  heroVisualPrimaryItems1Label: {
    defaultMessage: "Pricing page refresh",
    id: "l0fSZCjVen",
    description:
      "localisation-operations use case page: hero › visual › primary › items › #2 › label",
  },
  heroVisualPrimaryItems1Meta: {
    defaultMessage: "Marketing · 9 locales · in review",
    id: "ytNdLkQKoZ",
    description:
      "localisation-operations use case page: hero › visual › primary › items › #2 › meta",
  },
  heroVisualPrimaryItems2Label: {
    defaultMessage: "Billing FAQ update",
    id: "XPh+mFGsbz",
    description:
      "localisation-operations use case page: hero › visual › primary › items › #3 › label",
  },
  heroVisualPrimaryItems2Meta: {
    defaultMessage: "Support · 12 locales · synced",
    id: "uSTMZ4V2UT",
    description:
      "localisation-operations use case page: hero › visual › primary › items › #3 › meta",
  },
  heroVisualPrimaryItems3Label: {
    defaultMessage: "Onboarding emails",
    id: "HB9qoFZK03",
    description:
      "localisation-operations use case page: hero › visual › primary › items › #4 › label",
  },
  heroVisualPrimaryItems3Meta: {
    defaultMessage: "Lifecycle · 6 locales",
    id: "BivThxcMGF",
    description:
      "localisation-operations use case page: hero › visual › primary › items › #4 › meta",
  },
  heroVisualFloatingTitle: {
    defaultMessage: "#localisation",
    id: "3OpVBAoDiq",
    description: "localisation-operations use case page: hero › visual › floating › title",
  },
  heroVisualFloatingMessages0Text: {
    defaultMessage: "@Hyperlocalise what is blocking the spring release?",
    id: "0zS1uyDfjF",
    description:
      "localisation-operations use case page: hero › visual › floating › messages › #1 › text",
  },
  heroVisualFloatingMessages1Text: {
    defaultMessage:
      "Japanese and Korean are waiting on legal review. Everything else is approved and synced to Phrase.",
    id: "CRnmMfCR/b",
    description:
      "localisation-operations use case page: hero › visual › floating › messages › #2 › text",
  },
  shiftTitle: {
    defaultMessage: "From chasing status to running the programme",
    id: "FHaitXsdI/",
    description: "localisation-operations use case page: shift › title",
  },
  shiftBefore0: {
    defaultMessage: "Requests arrive in Slack threads, tickets, and emails, with no shared queue.",
    id: "Pn6wAjlMpT",
    description: "localisation-operations use case page: shift › before › #1",
  },
  shiftBefore1: {
    defaultMessage: "Status lives in a spreadsheet someone updates by hand every Friday.",
    id: "nYLHLZWpNm",
    description: "localisation-operations use case page: shift › before › #2",
  },
  shiftBefore2: {
    defaultMessage: "Switching an AI model or vendor means rebuilding the workflow.",
    id: "JdmZOy+P6b",
    description: "localisation-operations use case page: shift › before › #3",
  },
  shiftAfter0: {
    defaultMessage: "Every request lands in one queue with an owner, locales, and a due date.",
    id: "mnpHbfFvp+",
    description: "localisation-operations use case page: shift › after › #1",
  },
  shiftAfter1: {
    defaultMessage: "Live progress per locale, vendor, and reviewer, without a status meeting.",
    id: "HeI2Cwmu4h",
    description: "localisation-operations use case page: shift › after › #2",
  },
  shiftAfter2: {
    defaultMessage: "Swap models, vendors, or TMS without touching the workflow your team runs.",
    id: "d0fjmH4kUF",
    description: "localisation-operations use case page: shift › after › #3",
  },
  guideTitle: {
    defaultMessage: "From request to delivered, in one workflow",
    id: "xnyf7qSKYs",
    description: "localisation-operations use case page: guide › title",
  },
  guideBody: {
    defaultMessage:
      "Set the workflow up once. Every request after that follows it, whichever team it comes from.",
    id: "1QVaqADETf",
    description: "localisation-operations use case page: guide › body",
  },
  guideSteps0Title: {
    defaultMessage: "Capture every request",
    id: "b0RMhwhL2Q",
    description: "localisation-operations use case page: guide › steps › #1 › title",
  },
  guideSteps0Body: {
    defaultMessage:
      "Requests from Slack, GitHub, and your CMS land in one queue with source files, context, and target locales attached.",
    id: "w+f2l71Bsn",
    description: "localisation-operations use case page: guide › steps › #1 › body",
  },
  guideSteps0VisualTitle: {
    defaultMessage: "Intake",
    id: "f++hWlSM3P",
    description: "localisation-operations use case page: guide › steps › #1 › visual › title",
  },
  guideSteps0VisualSubtitle: {
    defaultMessage: "Today",
    id: "9fdWWST9T2",
    description: "localisation-operations use case page: guide › steps › #1 › visual › subtitle",
  },
  guideSteps0VisualItems0Label: {
    defaultMessage: "Spring release strings",
    id: "vSdBMC9HgU",
    description:
      "localisation-operations use case page: guide › steps › #1 › visual › items › #1 › label",
  },
  guideSteps0VisualItems0Meta: {
    defaultMessage: "GitHub · 412 strings",
    id: "mAtWTZKBQk",
    description:
      "localisation-operations use case page: guide › steps › #1 › visual › items › #1 › meta",
  },
  guideSteps0VisualItems1Label: {
    defaultMessage: "Pricing page",
    id: "rB/rVPP535",
    description:
      "localisation-operations use case page: guide › steps › #1 › visual › items › #2 › label",
  },
  guideSteps0VisualItems1Meta: {
    defaultMessage: "Contentful · 3 pages",
    id: "3h8RDAFwi0",
    description:
      "localisation-operations use case page: guide › steps › #1 › visual › items › #2 › meta",
  },
  guideSteps0VisualItems2Label: {
    defaultMessage: "Partner deck",
    id: "NoEPWeEH63",
    description:
      "localisation-operations use case page: guide › steps › #1 › visual › items › #3 › label",
  },
  guideSteps0VisualItems2Meta: {
    defaultMessage: "Slack · 18 slides",
    id: "oipkLE9f/+",
    description:
      "localisation-operations use case page: guide › steps › #1 › visual › items › #3 › meta",
  },
  guideSteps1Title: {
    defaultMessage: "Route work automatically",
    id: "BRhb3j8GLb",
    description: "localisation-operations use case page: guide › steps › #2 › title",
  },
  guideSteps1Body: {
    defaultMessage:
      "Rules send each job to the right AI model, vendor, or in-house reviewer by content type, market, and risk.",
    id: "8e60dJs7TH",
    description: "localisation-operations use case page: guide › steps › #2 › body",
  },
  guideSteps1VisualTitle: {
    defaultMessage: "Routing rules",
    id: "O6LhF+oetb",
    description: "localisation-operations use case page: guide › steps › #2 › visual › title",
  },
  guideSteps1VisualItems0Label: {
    defaultMessage: "Legal copy to in-house reviewer",
    id: "DD44xzgJP2",
    description:
      "localisation-operations use case page: guide › steps › #2 › visual › items › #1 › label",
  },
  guideSteps1VisualItems0Meta: {
    defaultMessage: "Japanese and Korean",
    id: "FdkH/PkHCk",
    description:
      "localisation-operations use case page: guide › steps › #2 › visual › items › #1 › meta",
  },
  guideSteps1VisualItems1Label: {
    defaultMessage: "UI strings to AI draft and linguist",
    id: "58+QVsQq8v",
    description:
      "localisation-operations use case page: guide › steps › #2 › visual › items › #2 › label",
  },
  guideSteps1VisualItems1Meta: {
    defaultMessage: "12 locales",
    id: "AEM87CQ1wd",
    description:
      "localisation-operations use case page: guide › steps › #2 › visual › items › #2 › meta",
  },
  guideSteps1VisualItems2Label: {
    defaultMessage: "Campaign copy to agency review",
    id: "BVyeP1oJ68",
    description:
      "localisation-operations use case page: guide › steps › #2 › visual › items › #3 › label",
  },
  guideSteps1VisualItems2Meta: {
    defaultMessage: "German and French",
    id: "FKtGb+SrNW",
    description:
      "localisation-operations use case page: guide › steps › #2 › visual › items › #3 › meta",
  },
  guideSteps2Title: {
    defaultMessage: "Track every locale live",
    id: "keLfuoYZXy",
    description: "localisation-operations use case page: guide › steps › #3 › title",
  },
  guideSteps2Body: {
    defaultMessage:
      "One board shows progress, blockers, and owners per locale, so status questions take seconds.",
    id: "pO3RCUlEDX",
    description: "localisation-operations use case page: guide › steps › #3 › body",
  },
  guideSteps2VisualTitle: {
    defaultMessage: "Spring release",
    id: "H0IVjRDKWW",
    description: "localisation-operations use case page: guide › steps › #3 › visual › title",
  },
  guideSteps2VisualSubtitle: {
    defaultMessage: "14 locales · due Friday",
    id: "//ohFSEDab",
    description: "localisation-operations use case page: guide › steps › #3 › visual › subtitle",
  },
  guideSteps2VisualLocales2Note: {
    defaultMessage: "Legal review",
    id: "X6G41QidEi",
    description:
      "localisation-operations use case page: guide › steps › #3 › visual › locales › #3 › note",
  },
  guideSteps2VisualLocales3Note: {
    defaultMessage: "Legal review",
    id: "JPB+PSHO43",
    description:
      "localisation-operations use case page: guide › steps › #3 › visual › locales › #4 › note",
  },
  guideSteps3Title: {
    defaultMessage: "Deliver and report",
    id: "KNrIQu6GXI",
    description: "localisation-operations use case page: guide › steps › #4 › title",
  },
  guideSteps3Body: {
    defaultMessage:
      "Approved work syncs back to your TMS and repositories. Reports show volume, turnaround, and cost by market.",
    id: "UGc7qcLPZM",
    description: "localisation-operations use case page: guide › steps › #4 › body",
  },
  guideSteps3VisualTitle: {
    defaultMessage: "Programme this month",
    id: "e0R01UbGHE",
    description: "localisation-operations use case page: guide › steps › #4 › visual › title",
  },
  guideSteps3VisualMetrics0Label: {
    defaultMessage: "Words delivered",
    id: "SC+eIOj3KC",
    description:
      "localisation-operations use case page: guide › steps › #4 › visual › metrics › #1 › label",
  },
  guideSteps3VisualMetrics1Label: {
    defaultMessage: "Median turnaround",
    id: "wTBR5ArNlg",
    description:
      "localisation-operations use case page: guide › steps › #4 › visual › metrics › #2 › label",
  },
  guideSteps3VisualMetrics2Label: {
    defaultMessage: "On time",
    id: "FURbB7EoRV",
    description:
      "localisation-operations use case page: guide › steps › #4 › visual › metrics › #3 › label",
  },
  integrationsTitle: {
    defaultMessage: "Connects to the stack you already run",
    id: "u8fmrg2kzX",
    description: "localisation-operations use case page: integrations › title",
  },
  capabilitiesTitle: {
    defaultMessage: "Everything a localisation programme needs",
    id: "f2SPcmNGJg",
    description: "localisation-operations use case page: capabilities › title",
  },
  capabilitiesItems0Title: {
    defaultMessage: "One intake queue",
    id: "H+Phf6MjyG",
    description: "localisation-operations use case page: capabilities › items › #1 › title",
  },
  capabilitiesItems0Body: {
    defaultMessage:
      "Collect requests from every team and tool, with context and deadlines attached.",
    id: "Uoh7KZA6D2",
    description: "localisation-operations use case page: capabilities › items › #1 › body",
  },
  capabilitiesItems1Title: {
    defaultMessage: "Rules-based routing",
    id: "DV2wl5tIwp",
    description: "localisation-operations use case page: capabilities › items › #2 › title",
  },
  capabilitiesItems1Body: {
    defaultMessage: "Send work to AI, vendors, or reviewers by content type, market, and risk.",
    id: "xMJc83KAgR",
    description: "localisation-operations use case page: capabilities › items › #2 › body",
  },
  capabilitiesItems2Title: {
    defaultMessage: "Vendors and reviewers",
    id: "syqWezPrib",
    description: "localisation-operations use case page: capabilities › items › #3 › title",
  },
  capabilitiesItems2Body: {
    defaultMessage: "Assign, track, and compare vendors and linguists in one place.",
    id: "W7boHTnTHE",
    description: "localisation-operations use case page: capabilities › items › #3 › body",
  },
  capabilitiesItems3Title: {
    defaultMessage: "Bring your own models",
    id: "8fEAeumr3B",
    description: "localisation-operations use case page: capabilities › items › #4 › title",
  },
  capabilitiesItems3Body: {
    defaultMessage: "Use OpenAI, Anthropic, Gemini, or Mistral, and switch without rework.",
    id: "qKaqM1lCgl",
    description: "localisation-operations use case page: capabilities › items › #4 › body",
  },
  capabilitiesItems4Title: {
    defaultMessage: "Works with your TMS",
    id: "SPhzpW162o",
    description: "localisation-operations use case page: capabilities › items › #5 › title",
  },
  capabilitiesItems4Body: {
    defaultMessage: "Keep Phrase, Crowdin, Lokalise, or Smartling as your system of record.",
    id: "ucZNz3LNkC",
    description: "localisation-operations use case page: capabilities › items › #5 › body",
  },
  capabilitiesItems5Title: {
    defaultMessage: "Programme reporting",
    id: "6Dbk+444Cr",
    description: "localisation-operations use case page: capabilities › items › #6 › title",
  },
  capabilitiesItems5Body: {
    defaultMessage: "See volume, turnaround, quality, and cost by market and team.",
    id: "6luzjxflA9",
    description: "localisation-operations use case page: capabilities › items › #6 › body",
  },
  scenarioTitle: {
    defaultMessage: "A release, a campaign, and a help center update in the same week",
    id: "ZySraghy62",
    description: "localisation-operations use case page: scenario › title",
  },
  scenarioBody: {
    defaultMessage:
      "How a two-person localisation team ships three streams of work across 14 locales without a status meeting.",
    id: "+r2qBYg0u3",
    description: "localisation-operations use case page: scenario › body",
  },
  scenarioEvents0Time: {
    defaultMessage: "Monday 09:00",
    id: "elo92/q1ia",
    description: "localisation-operations use case page: scenario › events › #1 › time",
  },
  scenarioEvents0Title: {
    defaultMessage: "Three requests arrive",
    id: "rV5EJEYaE4",
    description: "localisation-operations use case page: scenario › events › #1 › title",
  },
  scenarioEvents0Body: {
    defaultMessage:
      "Product opens a release PR, marketing drops a campaign brief in Slack, and support updates the billing FAQ. All three land in one queue.",
    id: "0+dFEJ2zza",
    description: "localisation-operations use case page: scenario › events › #1 › body",
  },
  scenarioEvents1Time: {
    defaultMessage: "Monday 09:05",
    id: "RkUtECeRoh",
    description: "localisation-operations use case page: scenario › events › #2 › time",
  },
  scenarioEvents1Title: {
    defaultMessage: "Work routes itself",
    id: "8v5SgaseCA",
    description: "localisation-operations use case page: scenario › events › #2 › title",
  },
  scenarioEvents1Body: {
    defaultMessage:
      "UI strings go to AI drafting with linguist review. Campaign copy goes to the agency. Legal copy for Japan and Korea goes to in-house review.",
    id: "YRhyAy5K5l",
    description: "localisation-operations use case page: scenario › events › #2 › body",
  },
  scenarioEvents2Time: {
    defaultMessage: "Wednesday 14:00",
    id: "1/+S2yZNDt",
    description: "localisation-operations use case page: scenario › events › #3 › time",
  },
  scenarioEvents2Title: {
    defaultMessage: "A blocker surfaces early",
    id: "MQHLsg7IOD",
    description: "localisation-operations use case page: scenario › events › #3 › title",
  },
  scenarioEvents2Body: {
    defaultMessage:
      "The board flags Japanese and Korean waiting on legal. The manager reassigns a reviewer before the deadline is at risk.",
    id: "CVjltZdH9i",
    description: "localisation-operations use case page: scenario › events › #3 › body",
  },
  scenarioEvents3Time: {
    defaultMessage: "Friday 16:00",
    id: "vuDJrMvcr+",
    description: "localisation-operations use case page: scenario › events › #4 › time",
  },
  scenarioEvents3Title: {
    defaultMessage: "Everything ships",
    id: "B410H43ikZ",
    description: "localisation-operations use case page: scenario › events › #4 › title",
  },
  scenarioEvents3Body: {
    defaultMessage:
      "Approved translations sync to the TMS and repository. The weekly report goes to leadership automatically.",
    id: "l6P4u9Qhhk",
    description: "localisation-operations use case page: scenario › events › #4 › body",
  },
  ctaHeadline: {
    defaultMessage: "See your whole localisation programme in one view",
    id: "bzOXRQqAuL",
    description: "localisation-operations use case page: cta › headline",
  },
  ctaBody: {
    defaultMessage:
      "Start a free workspace or book a demo, and run requests, reviewers, vendors, and models from a single workflow.",
    id: "fZ3SqvmAGk",
    description: "localisation-operations use case page: cta › body",
  },
});

export const localisationOperationsStory: UseCaseStory = {
  slug: "localisation-operations",
  hero: {
    headline: m.heroHeadline,
    body: m.heroBody,
    visual: {
      kind: "composition",
      primary: {
        kind: "checklist",
        title: m.heroVisualPrimaryTitle,
        subtitle: m.heroVisualPrimarySubtitle,
        items: [
          {
            label: m.heroVisualPrimaryItems0Label,
            meta: m.heroVisualPrimaryItems0Meta,
            status: "running",
          },
          {
            label: m.heroVisualPrimaryItems1Label,
            meta: m.heroVisualPrimaryItems1Meta,
            status: "warn",
          },
          {
            label: m.heroVisualPrimaryItems2Label,
            meta: m.heroVisualPrimaryItems2Meta,
            status: "done",
          },
          {
            label: m.heroVisualPrimaryItems3Label,
            meta: m.heroVisualPrimaryItems3Meta,
            status: "todo",
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
              status: "running",
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
          ],
        },
      },
      {
        title: m.guideSteps2Title,
        body: m.guideSteps2Body,
        visual: {
          kind: "locales",
          title: m.guideSteps2VisualTitle,
          subtitle: m.guideSteps2VisualSubtitle,
          locales: [
            {
              code: "de-DE",
              progress: 100,
              status: "done",
            },
            {
              code: "fr-FR",
              progress: 100,
              status: "done",
            },
            {
              code: "ja-JP",
              progress: 72,
              status: "warn",
              note: m.guideSteps2VisualLocales2Note,
            },
            {
              code: "ko-KR",
              progress: 64,
              status: "warn",
              note: m.guideSteps2VisualLocales3Note,
            },
            {
              code: "es-ES",
              progress: 100,
              status: "done",
            },
            {
              code: "pt-BR",
              progress: 88,
              status: "running",
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
              value: "1.2M",
              delta: "+18%",
              tone: "good",
            },
            {
              label: m.guideSteps3VisualMetrics1Label,
              value: "2.4d",
              delta: "−31%",
              tone: "good",
            },
            {
              label: m.guideSteps3VisualMetrics2Label,
              value: "96%",
              tone: "neutral",
            },
          ],
          bars: [
            {
              label: "de-DE",
              value: 82,
            },
            {
              label: "fr-FR",
              value: 76,
            },
            {
              label: "ja-JP",
              value: 64,
            },
            {
              label: "es-ES",
              value: 58,
            },
            {
              label: "pt-BR",
              value: 47,
            },
          ],
        },
      },
    ],
  },
  integrations: {
    title: m.integrationsTitle,
    ids: [
      "phrase",
      "crowdin",
      "lokalise",
      "smartling",
      "slack",
      "github",
      "contentful",
      "openai",
      "anthropic",
    ],
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
