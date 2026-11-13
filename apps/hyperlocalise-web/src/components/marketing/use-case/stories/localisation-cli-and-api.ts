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
    defaultMessage: "Localisation as code, from your terminal and CI",
    id: "93wWtMjFZe",
    description: "localisation-cli-and-api use case page: hero › headline",
  },
  heroBody: {
    defaultMessage:
      "Extract messages, push source files, and pull translations with one CLI and a config file in your repo. Use the API when you need to build your own pipeline.",
    id: "C17n6+iWbi",
    description: "localisation-cli-and-api use case page: hero › body",
  },
  heroVisualFloatingTitle: {
    defaultMessage: "Web app project",
    id: "ayl3/ZVjNl",
    description: "localisation-cli-and-api use case page: hero › visual › floating › title",
  },
  heroVisualFloatingItems0Label: {
    defaultMessage: "Source uploaded",
    id: "18AD0ZARjU",
    description:
      "localisation-cli-and-api use case page: hero › visual › floating › items › #1 › label",
  },
  heroVisualFloatingItems0Meta: {
    defaultMessage: "1,284 strings",
    id: "RBuo8Zw7HT",
    description:
      "localisation-cli-and-api use case page: hero › visual › floating › items › #1 › meta",
  },
  heroVisualFloatingItems1Label: {
    defaultMessage: "Translation",
    id: "7GlAZgDRzX",
    description:
      "localisation-cli-and-api use case page: hero › visual › floating › items › #2 › label",
  },
  heroVisualFloatingItems1Meta: {
    defaultMessage: "9 locales",
    id: "xiDdn1qcaz",
    description:
      "localisation-cli-and-api use case page: hero › visual › floating › items › #2 › meta",
  },
  heroVisualFloatingItems2Label: {
    defaultMessage: "Review",
    id: "y90yQyiogC",
    description:
      "localisation-cli-and-api use case page: hero › visual › floating › items › #3 › label",
  },
  heroVisualFloatingItems2Meta: {
    defaultMessage: "6 of 9 locales approved",
    id: "0yMxn3EvJg",
    description:
      "localisation-cli-and-api use case page: hero › visual › floating › items › #3 › meta",
  },
  shiftTitle: {
    defaultMessage: "From manual exports to a pipeline you can version",
    id: "xk+k/M+PDZ",
    description: "localisation-cli-and-api use case page: shift › title",
  },
  shiftBefore0: {
    defaultMessage: "Someone exports files, uploads them, and downloads translations by hand.",
    id: "yAUAOUJKJW",
    description: "localisation-cli-and-api use case page: shift › before › #1",
  },
  shiftBefore1: {
    defaultMessage: "Each repository has its own scripts, and they break when the TMS changes.",
    id: "HhtmIaBPEp",
    description: "localisation-cli-and-api use case page: shift › before › #2",
  },
  shiftBefore2: {
    defaultMessage: "Translation status is invisible to the build.",
    id: "SZSj4CdCev",
    description: "localisation-cli-and-api use case page: shift › before › #3",
  },
  shiftAfter0: {
    defaultMessage: "One i18n.yml in the repo defines locales, files, and mappings.",
    id: "evosYJYI3D",
    description: "localisation-cli-and-api use case page: shift › after › #1",
  },
  shiftAfter1: {
    defaultMessage: "The same CLI runs on a laptop and in CI, with a scoped API key.",
    id: "wFbqTuata9",
    description: "localisation-cli-and-api use case page: shift › after › #2",
  },
  shiftAfter2: {
    defaultMessage: "Files and jobs are available over HTTP for anything custom.",
    id: "ARaMd0e7Az",
    description: "localisation-cli-and-api use case page: shift › after › #3",
  },
  guideTitle: {
    defaultMessage: "From one config file to translations in every build",
    id: "x/ut5BSwS9",
    description: "localisation-cli-and-api use case page: guide › title",
  },
  guideBody: {
    defaultMessage: "Set it up in minutes. The same commands run on your machine and in CI.",
    id: "0So/h7Alas",
    description: "localisation-cli-and-api use case page: guide › body",
  },
  guideSteps0Title: {
    defaultMessage: "Add a config file",
    id: "2g3Bm/xcgj",
    description: "localisation-cli-and-api use case page: guide › steps › #1 › title",
  },
  guideSteps0Body: {
    defaultMessage:
      "Describe your source locale, targets, and file mappings in i18n.yml. Copy the sample from your project settings to start.",
    id: "n6PrI6Ofr0",
    description: "localisation-cli-and-api use case page: guide › steps › #1 › body",
  },
  guideSteps1Title: {
    defaultMessage: "Push source files",
    id: "BGzLEF7KOj",
    description: "localisation-cli-and-api use case page: guide › steps › #2 › title",
  },
  guideSteps1Body: {
    defaultMessage:
      "Upload source files from your machine or CI with a scoped API key. Your team translates and reviews in the shared workspace.",
    id: "DaOqj1hk6B",
    description: "localisation-cli-and-api use case page: guide › steps › #2 › body",
  },
  guideSteps2Title: {
    defaultMessage: "Pull translations back",
    id: "8ur1wyQkwh",
    description: "localisation-cli-and-api use case page: guide › steps › #3 › title",
  },
  guideSteps2Body: {
    defaultMessage:
      "Pull approved translations into your repository with one command, then commit them like any other change.",
    id: "YRsZTvDHA6",
    description: "localisation-cli-and-api use case page: guide › steps › #3 › body",
  },
  guideSteps3Title: {
    defaultMessage: "Build your own with the API",
    id: "NbdfBJaBWJ",
    description: "localisation-cli-and-api use case page: guide › steps › #4 › title",
  },
  guideSteps3Body: {
    defaultMessage:
      "Upload files, create jobs, check progress, and download results over HTTP. Webhooks tell you when work is done.",
    id: "Iy4O0wR8OE",
    description: "localisation-cli-and-api use case page: guide › steps › #4 › body",
  },
  integrationsTitle: {
    defaultMessage: "Works with your repo and toolchain",
    id: "9MUWVfK9J8",
    description: "localisation-cli-and-api use case page: integrations › title",
  },
  capabilitiesTitle: {
    defaultMessage: "Built for engineering teams",
    id: "e6oA9b7w1i",
    description: "localisation-cli-and-api use case page: capabilities › title",
  },
  capabilitiesItems0Title: {
    defaultMessage: "One config file",
    id: "ZGS22PiQDq",
    description: "localisation-cli-and-api use case page: capabilities › items › #1 › title",
  },
  capabilitiesItems0Body: {
    defaultMessage: "Define locales, files, and mappings in i18n.yml, versioned with your code.",
    id: "lTLErStLe+",
    description: "localisation-cli-and-api use case page: capabilities › items › #1 › body",
  },
  capabilitiesItems1Title: {
    defaultMessage: "Message extraction",
    id: "TypwByiePt",
    description: "localisation-cli-and-api use case page: capabilities › items › #2 › title",
  },
  capabilitiesItems1Body: {
    defaultMessage: "Extract messages from source code into a catalog with one command.",
    id: "hBq+l5kL3j",
    description: "localisation-cli-and-api use case page: capabilities › items › #2 › body",
  },
  capabilitiesItems2Title: {
    defaultMessage: "Push and pull sync",
    id: "vfy5VcVVbE",
    description: "localisation-cli-and-api use case page: capabilities › items › #3 › title",
  },
  capabilitiesItems2Body: {
    defaultMessage: "Move source files up and translations down from a laptop or CI.",
    id: "pLGMvgbPjs",
    description: "localisation-cli-and-api use case page: capabilities › items › #3 › body",
  },
  capabilitiesItems3Title: {
    defaultMessage: "Scoped API keys",
    id: "PeZaDYWQ+7",
    description: "localisation-cli-and-api use case page: capabilities › items › #4 › title",
  },
  capabilitiesItems3Body: {
    defaultMessage: "Give CI only the permissions it needs, and revoke keys from settings.",
    id: "GclgySWtIq",
    description: "localisation-cli-and-api use case page: capabilities › items › #4 › body",
  },
  capabilitiesItems4Title: {
    defaultMessage: "Files and jobs API",
    id: "BJl05OKfV3",
    description: "localisation-cli-and-api use case page: capabilities › items › #5 › title",
  },
  capabilitiesItems4Body: {
    defaultMessage: "Upload files, create jobs, check progress, and download results over HTTP.",
    id: "hO6rXhN1+W",
    description: "localisation-cli-and-api use case page: capabilities › items › #5 › body",
  },
  capabilitiesItems5Title: {
    defaultMessage: "Webhooks",
    id: "kYKjDiCTuU",
    description: "localisation-cli-and-api use case page: capabilities › items › #6 › title",
  },
  capabilitiesItems5Body: {
    defaultMessage: "Get notified when jobs finish, so your pipeline can react.",
    id: "8Vh8Ae/7DJ",
    description: "localisation-cli-and-api use case page: capabilities › items › #6 › body",
  },
  scenarioTitle: {
    defaultMessage: "How we localise our own app",
    id: "iStybEGctZ",
    description: "localisation-cli-and-api use case page: scenario › title",
  },
  scenarioBody: {
    defaultMessage:
      "Hyperlocalise's web app ships in ten languages using the same CLI. No one uploads a file by hand.",
    id: "DtI2ewjxFV",
    description: "localisation-cli-and-api use case page: scenario › body",
  },
  scenarioEvents0Time: {
    defaultMessage: "On every merge",
    id: "jSncGx6/Fm",
    description: "localisation-cli-and-api use case page: scenario › events › #1 › time",
  },
  scenarioEvents0Title: {
    defaultMessage: "Extract and push",
    id: "tnPQJaxOqX",
    description: "localisation-cli-and-api use case page: scenario › events › #1 › title",
  },
  scenarioEvents0Body: {
    defaultMessage:
      "CI runs hl extract and hl sync push, so new messages reach the workspace within minutes.",
    id: "/1T4+5Ajdp",
    description: "localisation-cli-and-api use case page: scenario › events › #1 › body",
  },
  scenarioEvents1Time: {
    defaultMessage: "During the day",
    id: "NA/mPQd8Zc",
    description: "localisation-cli-and-api use case page: scenario › events › #2 › time",
  },
  scenarioEvents1Title: {
    defaultMessage: "Translate and review",
    id: "k8v/v9Mn0L",
    description: "localisation-cli-and-api use case page: scenario › events › #2 › title",
  },
  scenarioEvents1Body: {
    defaultMessage: "Linguists and agents translate in the workspace. Nobody touches a file.",
    id: "4pdfLuPtnC",
    description: "localisation-cli-and-api use case page: scenario › events › #2 › body",
  },
  scenarioEvents2Time: {
    defaultMessage: "Every night",
    id: "iV5ER67SZq",
    description: "localisation-cli-and-api use case page: scenario › events › #3 › time",
  },
  scenarioEvents2Title: {
    defaultMessage: "Pull translations",
    id: "oaRGEjx88/",
    description: "localisation-cli-and-api use case page: scenario › events › #3 › title",
  },
  scenarioEvents2Body: {
    defaultMessage:
      "A scheduled job runs hl sync pull and opens a pull request with the updated locale files.",
    id: "DBp1QKDYgw",
    description: "localisation-cli-and-api use case page: scenario › events › #3 › body",
  },
  scenarioEvents3Time: {
    defaultMessage: "Next morning",
    id: "AnhQeO8Ylb",
    description: "localisation-cli-and-api use case page: scenario › events › #4 › time",
  },
  scenarioEvents3Title: {
    defaultMessage: "Review and merge",
    id: "oSQhwxquK7",
    description: "localisation-cli-and-api use case page: scenario › events › #4 › title",
  },
  scenarioEvents3Body: {
    defaultMessage:
      "An engineer reviews the diff and merges. Every locale stays current with no manual steps.",
    id: "0WzgaMmIa3",
    description: "localisation-cli-and-api use case page: scenario › events › #4 › body",
  },
  ctaHeadline: {
    defaultMessage: "Put localisation in your pipeline",
    id: "VgnggScypZ",
    description: "localisation-cli-and-api use case page: cta › headline",
  },
  ctaBody: {
    defaultMessage:
      "Start free, create an API key, and run your first sync from your terminal in minutes.",
    id: "4aygwcFzYG",
    description: "localisation-cli-and-api use case page: cta › body",
  },
});

export const localisationCliAndApiStory: UseCaseStory = {
  slug: "localisation-cli-and-api",
  hero: {
    headline: m.heroHeadline,
    body: m.heroBody,
    visual: {
      kind: "composition",
      primary: {
        kind: "terminal",
        title: "~/acme-web",
        lines: [
          {
            kind: "cmd",
            text: "hl extract src --out-file lang/en-US.json",
          },
          {
            kind: "ok",
            text: "✓ Extracted 1,284 messages from 312 files",
          },
          {
            kind: "cmd",
            text: "hl sync push",
          },
          {
            kind: "ok",
            text: "✓ Uploaded lang/en-US.json",
          },
          {
            kind: "cmd",
            text: "hl sync pull",
          },
          {
            kind: "ok",
            text: "✓ Pulled 9 locales",
          },
        ],
      },
      floating: {
        kind: "checklist",
        title: m.heroVisualFloatingTitle,
        items: [
          {
            label: m.heroVisualFloatingItems0Label,
            meta: m.heroVisualFloatingItems0Meta,
            status: "done",
          },
          {
            label: m.heroVisualFloatingItems1Label,
            meta: m.heroVisualFloatingItems1Meta,
            status: "running",
          },
          {
            label: m.heroVisualFloatingItems2Label,
            meta: m.heroVisualFloatingItems2Meta,
            status: "running",
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
          kind: "terminal",
          title: "i18n.yml",
          lines: [
            {
              kind: "out",
              text: "locales:",
            },
            {
              kind: "out",
              text: "  source: en-US",
            },
            {
              kind: "out",
              text: "  targets: [de-DE, fr-FR, ja-JP]",
            },
            {
              kind: "out",
              text: "buckets:",
            },
            {
              kind: "out",
              text: "  app:",
            },
            {
              kind: "out",
              text: "    files:",
            },
            {
              kind: "out",
              text: "      - from: locales/{{source}}.json",
            },
            {
              kind: "out",
              text: "        to: locales/{{target}}.json",
            },
          ],
        },
      },
      {
        title: m.guideSteps1Title,
        body: m.guideSteps1Body,
        visual: {
          kind: "terminal",
          title: "ci",
          lines: [
            {
              kind: "dim",
              text: "# HYPERLOCALISE_API_KEY comes from your CI secrets",
            },
            {
              kind: "cmd",
              text: "hl sync push",
            },
            {
              kind: "ok",
              text: "✓ Uploaded 3 source files",
            },
            {
              kind: "ok",
              text: "✓ Ready for translation in the workspace",
            },
          ],
        },
      },
      {
        title: m.guideSteps2Title,
        body: m.guideSteps2Body,
        visual: {
          kind: "terminal",
          title: "~/acme-web",
          lines: [
            {
              kind: "cmd",
              text: "hl sync pull",
            },
            {
              kind: "ok",
              text: "✓ locales/de-DE.json",
            },
            {
              kind: "ok",
              text: "✓ locales/fr-FR.json",
            },
            {
              kind: "ok",
              text: "✓ locales/ja-JP.json",
            },
            {
              kind: "dim",
              text: "3 files updated",
            },
          ],
        },
      },
      {
        title: m.guideSteps3Title,
        body: m.guideSteps3Body,
        visual: {
          kind: "terminal",
          title: "api",
          lines: [
            {
              kind: "cmd",
              text: "curl https://hyperlocalise.com/api/v1/files \\",
            },
            {
              kind: "out",
              text: '  -H "x-api-key: $HYPERLOCALISE_API_KEY" \\',
            },
            {
              kind: "out",
              text: "  -F file=@locales/en-US.json",
            },
            {
              kind: "ok",
              text: '{ "file": { "id": "file_8f2c" } }',
            },
          ],
        },
      },
    ],
  },
  integrations: {
    title: m.integrationsTitle,
    ids: ["github", "phrase", "crowdin", "lokalise", "smartling", "openai", "anthropic", "gemini"],
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
