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
    defaultMessage: "Localisation that runs in your pull requests",
    id: "W98gM2eWcW",
    description: "github-release-localisation use case page: hero › headline",
  },
  heroBody: {
    defaultMessage:
      "Hyperlocalise finds changed strings in each PR, drafts translations with context from the diff, and reports status as a check. Missing or broken locales fail CI instead of reaching production.",
    id: "60dNMDV/gD",
    description: "github-release-localisation use case page: hero › body",
  },
  heroVisualPrimarySummary: {
    defaultMessage: "12 new strings · 9 locales translated · 1 term needs review",
    id: "JERhaPtRv/",
    description: "github-release-localisation use case page: hero › visual › primary › summary",
  },
  heroVisualPrimaryRows0Label: {
    defaultMessage: "Translated and checked",
    id: "xmiARHpc5R",
    description:
      "github-release-localisation use case page: hero › visual › primary › rows › #1 › label",
  },
  heroVisualPrimaryRows1Label: {
    defaultMessage: "Translated and checked",
    id: "jafSDivGWz",
    description:
      "github-release-localisation use case page: hero › visual › primary › rows › #2 › label",
  },
  heroVisualPrimaryRows2Label: {
    defaultMessage: "Glossary term needs review",
    id: "ZicQVyFd5S",
    description:
      "github-release-localisation use case page: hero › visual › primary › rows › #3 › label",
  },
  heroVisualPrimaryRows3Label: {
    defaultMessage: "Translated and checked",
    id: "ukB7cDBTou",
    description:
      "github-release-localisation use case page: hero › visual › primary › rows › #4 › label",
  },
  shiftTitle: {
    defaultMessage: "From a spreadsheet after merge to a check before merge",
    id: "2bzsDBjY1t",
    description: "github-release-localisation use case page: shift › title",
  },
  shiftBefore0: {
    defaultMessage: "Strings get exported to a spreadsheet or TMS after the PR merges.",
    id: "KDEYGfcR52",
    description: "github-release-localisation use case page: shift › before › #1",
  },
  shiftBefore1: {
    defaultMessage: "Translators see keys with no context, so UI copy breaks in other languages.",
    id: "goxmXqRcKn",
    description: "github-release-localisation use case page: shift › before › #2",
  },
  shiftBefore2: {
    defaultMessage: "Releases ship with missing locales, or wait days for translations.",
    id: "rGbYaQDv1J",
    description: "github-release-localisation use case page: shift › before › #3",
  },
  shiftAfter0: {
    defaultMessage: "New and changed strings are found in the pull request itself.",
    id: "l803fxLj4/",
    description: "github-release-localisation use case page: shift › after › #1",
  },
  shiftAfter1: {
    defaultMessage: "AI drafts and reviewers get the diff and the PR description as context.",
    id: "hIWZhkPS7w",
    description: "github-release-localisation use case page: shift › after › #2",
  },
  shiftAfter2: {
    defaultMessage: "A check shows locale status before merge, so nothing ships half translated.",
    id: "V0xq0XJvOw",
    description: "github-release-localisation use case page: shift › after › #3",
  },
  guideTitle: {
    defaultMessage: "From git push to translated, checked, and merged",
    id: "/nx22k5ZH5",
    description: "github-release-localisation use case page: guide › title",
  },
  guideBody: {
    defaultMessage: "Install the GitHub app, add a config file, and every pull request is covered.",
    id: "DMH8AixTRq",
    description: "github-release-localisation use case page: guide › body",
  },
  guideSteps0Title: {
    defaultMessage: "Open a pull request",
    id: "T+GlSWobhC",
    description: "github-release-localisation use case page: guide › steps › #1 › title",
  },
  guideSteps0Body: {
    defaultMessage:
      "Hyperlocalise finds new and changed strings in your locale files and reads the pull request for context.",
    id: "bZKgQE3fab",
    description: "github-release-localisation use case page: guide › steps › #1 › body",
  },
  guideSteps1Title: {
    defaultMessage: "Translations are drafted",
    id: "+y9Wz4mrek",
    description: "github-release-localisation use case page: guide › steps › #2 › title",
  },
  guideSteps1Body: {
    defaultMessage:
      "Each changed string is drafted with your glossary, brand voice, and context from the diff, then queued for review where needed.",
    id: "J5lMTbrrNd",
    description: "github-release-localisation use case page: guide › steps › #2 › body",
  },
  guideSteps1VisualTitle: {
    defaultMessage: "Changed strings",
    id: "9qBgN9G6FG",
    description: "github-release-localisation use case page: guide › steps › #2 › visual › title",
  },
  guideSteps1VisualSubtitle: {
    defaultMessage: "Pull request 482",
    id: "AsR0toC3mS",
    description:
      "github-release-localisation use case page: guide › steps › #2 › visual › subtitle",
  },
  guideSteps1VisualRows2Note: {
    defaultMessage: "Glossary term needs review",
    id: "pKnfoqfs1g",
    description:
      "github-release-localisation use case page: guide › steps › #2 › visual › rows › #3 › note",
  },
  guideSteps2Title: {
    defaultMessage: "A check reports status",
    id: "oYPdTi6kPs",
    description: "github-release-localisation use case page: guide › steps › #3 › title",
  },
  guideSteps2Body: {
    defaultMessage:
      "One check and one comment show coverage and quality for every locale. Failures can block the merge if you want them to.",
    id: "y0hlXWG3oQ",
    description: "github-release-localisation use case page: guide › steps › #3 › body",
  },
  guideSteps2VisualSummary: {
    defaultMessage: "All locales translated · 1 term needs review",
    id: "NQnoq730zk",
    description: "github-release-localisation use case page: guide › steps › #3 › visual › summary",
  },
  guideSteps2VisualRows0Label: {
    defaultMessage: "Translated and checked",
    id: "5Bp3U5iVji",
    description:
      "github-release-localisation use case page: guide › steps › #3 › visual › rows › #1 › label",
  },
  guideSteps2VisualRows1Label: {
    defaultMessage: "Glossary term needs review",
    id: "pS3AMnaY1g",
    description:
      "github-release-localisation use case page: guide › steps › #3 › visual › rows › #2 › label",
  },
  guideSteps2VisualRows2Label: {
    defaultMessage: "Translated and checked",
    id: "TxLzteAQOy",
    description:
      "github-release-localisation use case page: guide › steps › #3 › visual › rows › #3 › label",
  },
  guideSteps3Title: {
    defaultMessage: "Merge with every locale ready",
    id: "LWY4WexJvZ",
    description: "github-release-localisation use case page: guide › steps › #4 › title",
  },
  guideSteps3Body: {
    defaultMessage:
      "Approved translations land on the branch or sync to your TMS before you merge.",
    id: "zQnqnmrFqn",
    description: "github-release-localisation use case page: guide › steps › #4 › body",
  },
  integrationsTitle: {
    defaultMessage: "Fits the pipeline you already have",
    id: "NtZifTFkWL",
    description: "github-release-localisation use case page: integrations › title",
  },
  capabilitiesTitle: {
    defaultMessage: "Built for developer-led release workflows",
    id: "7sUe/8mHaG",
    description: "github-release-localisation use case page: capabilities › title",
  },
  capabilitiesItems0Title: {
    defaultMessage: "GitHub app",
    id: "jcu0bPD4G6",
    description: "github-release-localisation use case page: capabilities › items › #1 › title",
  },
  capabilitiesItems0Body: {
    defaultMessage: "Install once and every pull request gets localisation status.",
    id: "rPfBFhjUXr",
    description: "github-release-localisation use case page: capabilities › items › #1 › body",
  },
  capabilitiesItems1Title: {
    defaultMessage: "Diff-aware detection",
    id: "BpQUx5/NZI",
    description: "github-release-localisation use case page: capabilities › items › #2 › title",
  },
  capabilitiesItems1Body: {
    defaultMessage: "Find new, changed, and deleted strings in JSON, YAML, PO, XLIFF, and more.",
    id: "qnPBM97XQs",
    description: "github-release-localisation use case page: capabilities › items › #2 › body",
  },
  capabilitiesItems2Title: {
    defaultMessage: "Drafts with context",
    id: "n51vqVPBWT",
    description: "github-release-localisation use case page: capabilities › items › #3 › title",
  },
  capabilitiesItems2Body: {
    defaultMessage:
      "Draft with the PR description, diff, and glossary, using the model you choose.",
    id: "mx8+eH0CMn",
    description: "github-release-localisation use case page: capabilities › items › #3 › body",
  },
  capabilitiesItems3Title: {
    defaultMessage: "Pull request checks",
    id: "reFQr7IU6m",
    description: "github-release-localisation use case page: capabilities › items › #4 › title",
  },
  capabilitiesItems3Body: {
    defaultMessage:
      "Report coverage and quality as a check, with one comment that stays up to date.",
    id: "DU2jjPueze",
    description: "github-release-localisation use case page: capabilities › items › #4 › body",
  },
  capabilitiesItems4Title: {
    defaultMessage: "Quality gates",
    id: "/uInehXTO7",
    description: "github-release-localisation use case page: capabilities › items › #5 › title",
  },
  capabilitiesItems4Body: {
    defaultMessage: "Fail the check on missing locales, broken placeholders, or glossary breaks.",
    id: "POrssHU+lZ",
    description: "github-release-localisation use case page: capabilities › items › #5 › body",
  },
  capabilitiesItems5Title: {
    defaultMessage: "TMS sync",
    id: "Pzm40208ml",
    description: "github-release-localisation use case page: capabilities › items › #6 › title",
  },
  capabilitiesItems5Body: {
    defaultMessage: "Keep your TMS as the system of record if you already have one.",
    id: "aSS7NkkPQ7",
    description: "github-release-localisation use case page: capabilities › items › #6 › body",
  },
  scenarioTitle: {
    defaultMessage: "A new onboarding step ships in nine languages on Friday",
    id: "70HN/E4IbW",
    description: "github-release-localisation use case page: scenario › title",
  },
  scenarioBody: {
    defaultMessage:
      "How a product team ships a UI change everywhere without a localisation freeze.",
    id: "Vdle+v0cnZ",
    description: "github-release-localisation use case page: scenario › body",
  },
  scenarioEvents0Time: {
    defaultMessage: "Tuesday 11:00",
    id: "GiGN7P8XzB",
    description: "github-release-localisation use case page: scenario › events › #1 › time",
  },
  scenarioEvents0Title: {
    defaultMessage: "The pull request opens",
    id: "xGBSB/wQAR",
    description: "github-release-localisation use case page: scenario › events › #1 › title",
  },
  scenarioEvents0Body: {
    defaultMessage: "An engineer adds a workspace setup step with 12 new strings.",
    id: "qtNXEEUdCy",
    description: "github-release-localisation use case page: scenario › events › #1 › body",
  },
  scenarioEvents1Time: {
    defaultMessage: "Tuesday 11:03",
    id: "PWQmkLvVV5",
    description: "github-release-localisation use case page: scenario › events › #2 › time",
  },
  scenarioEvents1Title: {
    defaultMessage: "Drafts appear",
    id: "hab8S3AbQR",
    description: "github-release-localisation use case page: scenario › events › #2 › title",
  },
  scenarioEvents1Body: {
    defaultMessage:
      "Hyperlocalise drafts all nine locales with context from the diff and posts a status comment on the pull request.",
    id: "ZmxQpXbnio",
    description: "github-release-localisation use case page: scenario › events › #2 › body",
  },
  scenarioEvents2Time: {
    defaultMessage: "Wednesday 15:00",
    id: "dDncgSBr8R",
    description: "github-release-localisation use case page: scenario › events › #3 › time",
  },
  scenarioEvents2Title: {
    defaultMessage: "One term is flagged",
    id: "xnZXx4+2a0",
    description: "github-release-localisation use case page: scenario › events › #3 › title",
  },
  scenarioEvents2Body: {
    defaultMessage:
      "The check flags a Japanese glossary term. A reviewer fixes it from the review link.",
    id: "ZQElt4MnER",
    description: "github-release-localisation use case page: scenario › events › #3 › body",
  },
  scenarioEvents3Time: {
    defaultMessage: "Friday 10:00",
    id: "o9LYxTfuJ1",
    description: "github-release-localisation use case page: scenario › events › #4 › time",
  },
  scenarioEvents3Title: {
    defaultMessage: "Merged and shipped",
    id: "0gS1i02L4F",
    description: "github-release-localisation use case page: scenario › events › #4 › title",
  },
  scenarioEvents3Body: {
    defaultMessage: "The check goes green. The feature ships in every language on release day.",
    id: "9rJOnnlotK",
    description: "github-release-localisation use case page: scenario › events › #4 › body",
  },
  ctaHeadline: {
    defaultMessage: "Add a localisation check to your next pull request",
    id: "2T/aeUGznk",
    description: "github-release-localisation use case page: cta › headline",
  },
  ctaBody: {
    defaultMessage:
      "Start free, connect a repository, and see your first localisation check on the next pull request.",
    id: "0KCvc70oDn",
    description: "github-release-localisation use case page: cta › body",
  },
});

export const githubReleaseLocalisationStory: UseCaseStory = {
  slug: "github-release-localisation",
  hero: {
    headline: m.heroHeadline,
    body: m.heroBody,
    visual: {
      kind: "composition",
      primary: {
        kind: "pull-request",
        repo: "acme/web",
        branch: "feat/workspace-setup",
        title: "feat(onboarding): add workspace setup step",
        number: 482,
        summary: m.heroVisualPrimarySummary,
        rows: [
          {
            locale: "de-DE",
            label: m.heroVisualPrimaryRows0Label,
            status: "done",
          },
          {
            locale: "fr-FR",
            label: m.heroVisualPrimaryRows1Label,
            status: "done",
          },
          {
            locale: "ja-JP",
            label: m.heroVisualPrimaryRows2Label,
            status: "warn",
          },
          {
            locale: "es-ES",
            label: m.heroVisualPrimaryRows3Label,
            status: "done",
          },
        ],
      },
      floating: {
        kind: "terminal",
        title: "hyperlocalise/check",
        lines: [
          {
            kind: "ok",
            text: "✓ 12 new strings found",
          },
          {
            kind: "ok",
            text: "✓ 8 locales passed",
          },
          {
            kind: "warn",
            text: "! ja-JP: glossary term needs review",
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
          title: "zsh",
          lines: [
            {
              kind: "cmd",
              text: "git push origin feat/workspace-setup",
            },
            {
              kind: "dim",
              text: "Enumerating objects: 14, done.",
            },
            {
              kind: "out",
              text: "remote: Create a pull request for 'feat/workspace-setup':",
            },
            {
              kind: "out",
              text: "remote:   https://github.com/acme/web/pull/482",
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
              key: "onboarding.workspace.title",
              source: "Name your workspace",
              target: "Benenne deinen Arbeitsbereich",
              locale: "de-DE",
              status: "done",
            },
            {
              key: "onboarding.workspace.hint",
              source: "You can change this later in Settings.",
              target: "Du kannst das später in den Einstellungen ändern.",
              locale: "de-DE",
              status: "done",
            },
            {
              key: "onboarding.invite.cta",
              source: "Invite teammates",
              target: "チームメンバーを招待",
              locale: "ja-JP",
              status: "warn",
              note: m.guideSteps1VisualRows2Note,
            },
          ],
        },
      },
      {
        title: m.guideSteps2Title,
        body: m.guideSteps2Body,
        visual: {
          kind: "pull-request",
          repo: "acme/web",
          branch: "feat/workspace-setup",
          title: "feat(onboarding): add workspace setup step",
          number: 482,
          summary: m.guideSteps2VisualSummary,
          rows: [
            {
              locale: "de-DE",
              label: m.guideSteps2VisualRows0Label,
              status: "done",
            },
            {
              locale: "ja-JP",
              label: m.guideSteps2VisualRows1Label,
              status: "warn",
            },
            {
              locale: "pt-BR",
              label: m.guideSteps2VisualRows2Label,
              status: "done",
            },
          ],
        },
      },
      {
        title: m.guideSteps3Title,
        body: m.guideSteps3Body,
        visual: {
          kind: "terminal",
          title: "hyperlocalise/check",
          lines: [
            {
              kind: "dim",
              text: "Run hyperlocalise/check",
            },
            {
              kind: "ok",
              text: "✓ 12 new strings found",
            },
            {
              kind: "ok",
              text: "✓ 9 of 9 locales translated",
            },
            {
              kind: "ok",
              text: "✓ Glossary and placeholder checks passed",
            },
            {
              kind: "ok",
              text: "✓ Ready to merge",
            },
          ],
        },
      },
    ],
  },
  integrations: {
    title: m.integrationsTitle,
    ids: ["github", "slack", "phrase", "crowdin", "lokalise", "openai", "anthropic", "gemini"],
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
