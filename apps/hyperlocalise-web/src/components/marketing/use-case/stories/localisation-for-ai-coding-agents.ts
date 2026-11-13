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
    defaultMessage: "Localise from Claude Code, Codex, and Cursor",
    id: "vP/6EyNqHT",
    description: "localisation-for-ai-coding-agents use case page: hero › headline",
  },
  heroBody: {
    defaultMessage:
      "Connect your coding agent to Hyperlocalise over MCP. It can read projects, keys, and glossaries, start translation, and check status, all without leaving your editor.",
    id: "B4Bic3CT6V",
    description: "localisation-for-ai-coding-agents use case page: hero › body",
  },
  heroVisualPrimaryTitle: {
    defaultMessage: "Claude Code",
    id: "w5hte8URsL",
    description: "localisation-for-ai-coding-agents use case page: hero › visual › primary › title",
  },
  heroVisualPrimaryMessages0Text: {
    defaultMessage:
      "Translate the new onboarding strings into German and Japanese, and use our glossary.",
    id: "qYhahHvJ3V",
    description:
      "localisation-for-ai-coding-agents use case page: hero › visual › primary › messages › #1 › text",
  },
  heroVisualPrimaryMessages1Text: {
    defaultMessage:
      "Done. I found 12 new strings in the web app project, started translation for both locales, and flagged one Japanese term for review.",
    id: "t+KH+capCA",
    description:
      "localisation-for-ai-coding-agents use case page: hero › visual › primary › messages › #2 › text",
  },
  heroVisualPrimaryTools0Detail: {
    defaultMessage: "Found the web app project",
    id: "GIxSgtFW2B",
    description:
      "localisation-for-ai-coding-agents use case page: hero › visual › primary › tools › #1 › detail",
  },
  heroVisualPrimaryTools1Detail: {
    defaultMessage: "4 terms matched",
    id: "Ir5QK37QxY",
    description:
      "localisation-for-ai-coding-agents use case page: hero › visual › primary › tools › #2 › detail",
  },
  heroVisualPrimaryTools2Detail: {
    defaultMessage: "German and Japanese",
    id: "2qrw/xVGP9",
    description:
      "localisation-for-ai-coding-agents use case page: hero › visual › primary › tools › #3 › detail",
  },
  heroVisualFloatingTitle: {
    defaultMessage: "Web app project",
    id: "SOuRBCa6pO",
    description:
      "localisation-for-ai-coding-agents use case page: hero › visual › floating › title",
  },
  heroVisualFloatingItems0Label: {
    defaultMessage: "German",
    id: "FYX1eDP3AQ",
    description:
      "localisation-for-ai-coding-agents use case page: hero › visual › floating › items › #1 › label",
  },
  heroVisualFloatingItems0Meta: {
    defaultMessage: "12 of 12 strings",
    id: "OjTWafZrQH",
    description:
      "localisation-for-ai-coding-agents use case page: hero › visual › floating › items › #1 › meta",
  },
  heroVisualFloatingItems1Label: {
    defaultMessage: "Japanese",
    id: "Xf9/SjeVmS",
    description:
      "localisation-for-ai-coding-agents use case page: hero › visual › floating › items › #2 › label",
  },
  heroVisualFloatingItems1Meta: {
    defaultMessage: "11 of 12 strings",
    id: "C8c+ZXLf3c",
    description:
      "localisation-for-ai-coding-agents use case page: hero › visual › floating › items › #2 › meta",
  },
  shiftTitle: {
    defaultMessage: "From context switching to asking your agent",
    id: "xrjRwFNsAt",
    description: "localisation-for-ai-coding-agents use case page: shift › title",
  },
  shiftBefore0: {
    defaultMessage:
      "Adding a string means opening the TMS, finding the project, and uploading by hand.",
    id: "vR/EEYjPku",
    description: "localisation-for-ai-coding-agents use case page: shift › before › #1",
  },
  shiftBefore1: {
    defaultMessage: "Your agent writes UI copy with no idea of your glossary or tone.",
    id: "7rZjSz8b+7",
    description: "localisation-for-ai-coding-agents use case page: shift › before › #2",
  },
  shiftBefore2: {
    defaultMessage: "Checking translation status means another tab and another login.",
    id: "kCFGZHyCZf",
    description: "localisation-for-ai-coding-agents use case page: shift › before › #3",
  },
  shiftAfter0: {
    defaultMessage: "Ask your agent to translate new strings, and it handles the round trip.",
    id: "CgwxKh13Qu",
    description: "localisation-for-ai-coding-agents use case page: shift › after › #1",
  },
  shiftAfter1: {
    defaultMessage: "The agent reads your glossary and guidelines before it writes copy.",
    id: "l2fO0PHzp4",
    description: "localisation-for-ai-coding-agents use case page: shift › after › #2",
  },
  shiftAfter2: {
    defaultMessage: "Status, jobs, and review items are one question away.",
    id: "aRoZ1fYI5t",
    description: "localisation-for-ai-coding-agents use case page: shift › after › #3",
  },
  guideTitle: {
    defaultMessage: "From one command to localisation in your editor",
    id: "o83uifr+5M",
    description: "localisation-for-ai-coding-agents use case page: guide › title",
  },
  guideBody: {
    defaultMessage:
      "Connect once with OAuth. The agent works with your existing workspace permissions.",
    id: "fMEDofN5Rc",
    description: "localisation-for-ai-coding-agents use case page: guide › body",
  },
  guideSteps0Title: {
    defaultMessage: "Connect your agent",
    id: "JpmYHdvmx/",
    description: "localisation-for-ai-coding-agents use case page: guide › steps › #1 › title",
  },
  guideSteps0Body: {
    defaultMessage:
      "Add the Hyperlocalise MCP server to Claude Code, Codex, or Cursor, then approve access in your browser.",
    id: "jtGwZFwix/",
    description: "localisation-for-ai-coding-agents use case page: guide › steps › #1 › body",
  },
  guideSteps1Title: {
    defaultMessage: "Ask for what you need",
    id: "SseIlVvNV7",
    description: "localisation-for-ai-coding-agents use case page: guide › steps › #2 › title",
  },
  guideSteps1Body: {
    defaultMessage:
      "Describe the task in plain language. The agent finds the right project, files, and keys.",
    id: "dqsMLe+pG9",
    description: "localisation-for-ai-coding-agents use case page: guide › steps › #2 › body",
  },
  guideSteps1VisualTitle: {
    defaultMessage: "Codex",
    id: "7szgqzjv8J",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #2 › visual › title",
  },
  guideSteps1VisualMessages0Text: {
    defaultMessage: "List the Hyperlocalise projects I can access. Do not change anything.",
    id: "+orR6Twfqf",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #2 › visual › messages › #1 › text",
  },
  guideSteps1VisualMessages1Text: {
    defaultMessage: "You can access three projects: Web app, Help center, and Marketing site.",
    id: "FGAEk1PCM1",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #2 › visual › messages › #2 › text",
  },
  guideSteps1VisualTools0Detail: {
    defaultMessage: "3 projects",
    id: "mG3TTkAyuj",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #2 › visual › tools › #1 › detail",
  },
  guideSteps2Title: {
    defaultMessage: "Translate with your rules",
    id: "M0c/KlRoZY",
    description: "localisation-for-ai-coding-agents use case page: guide › steps › #3 › title",
  },
  guideSteps2Body: {
    defaultMessage:
      "The agent reads your glossary before it writes copy, then starts translation for the locales you choose.",
    id: "DaTM0arbFE",
    description: "localisation-for-ai-coding-agents use case page: guide › steps › #3 › body",
  },
  guideSteps2VisualTitle: {
    defaultMessage: "Cursor",
    id: "k9sVdhJmaT",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #3 › visual › title",
  },
  guideSteps2VisualMessages0Text: {
    defaultMessage: "Add German and Japanese for the new settings strings, and use our glossary.",
    id: "w8s+r3qs+A",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #3 › visual › messages › #1 › text",
  },
  guideSteps2VisualMessages1Text: {
    defaultMessage:
      "I checked 4 glossary terms and started translation for both locales. One Japanese term needs a reviewer.",
    id: "bwYh1iVT7a",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #3 › visual › messages › #2 › text",
  },
  guideSteps2VisualTools0Detail: {
    defaultMessage: "4 terms matched",
    id: "M1CV39deU5",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #3 › visual › tools › #1 › detail",
  },
  guideSteps2VisualTools1Detail: {
    defaultMessage: "German and Japanese",
    id: "7h6iTndt6m",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #3 › visual › tools › #2 › detail",
  },
  guideSteps3Title: {
    defaultMessage: "Check status and review",
    id: "cj9RDopxFz",
    description: "localisation-for-ai-coding-agents use case page: guide › steps › #4 › title",
  },
  guideSteps3Body: {
    defaultMessage:
      "Ask what is done, what is blocked, and what needs review, then open the review link when you are ready.",
    id: "y+z611MxK1",
    description: "localisation-for-ai-coding-agents use case page: guide › steps › #4 › body",
  },
  guideSteps3VisualTitle: {
    defaultMessage: "Claude Code",
    id: "HyuWK4KQyx",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #4 › visual › title",
  },
  guideSteps3VisualMessages0Text: {
    defaultMessage: "What is left before the settings page is fully translated?",
    id: "vRm7n5oNu5",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #4 › visual › messages › #1 › text",
  },
  guideSteps3VisualMessages1Text: {
    defaultMessage:
      "German is done. Japanese has one string waiting for review. Here is the review link.",
    id: "homY5eJMlB",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #4 › visual › messages › #2 › text",
  },
  guideSteps3VisualTools0Detail: {
    defaultMessage: "1 string in review",
    id: "UyGuabMbzP",
    description:
      "localisation-for-ai-coding-agents use case page: guide › steps › #4 › visual › tools › #1 › detail",
  },
  integrationsTitle: {
    defaultMessage: "Works in the agents your team already uses",
    id: "kQmBWOXc/o",
    description: "localisation-for-ai-coding-agents use case page: integrations › title",
  },
  capabilitiesTitle: {
    defaultMessage: "Your workspace, available to your agent",
    id: "qWQhSAKJ85",
    description: "localisation-for-ai-coding-agents use case page: capabilities › title",
  },
  capabilitiesItems0Title: {
    defaultMessage: "Hosted MCP server",
    id: "swxYu1FPby",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #1 › title",
  },
  capabilitiesItems0Body: {
    defaultMessage: "Connect Claude Code, Codex, or Cursor with one command and no infrastructure.",
    id: "sozNWwrNPw",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #1 › body",
  },
  capabilitiesItems1Title: {
    defaultMessage: "OAuth sign-in",
    id: "jS9iUDjsFr",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #2 › title",
  },
  capabilitiesItems1Body: {
    defaultMessage: "Approve access in your browser. The agent gets your role, nothing more.",
    id: "7lMLKD1e5H",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #2 › body",
  },
  capabilitiesItems2Title: {
    defaultMessage: "Projects, files, and keys",
    id: "tJuRdxwoXu",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #3 › title",
  },
  capabilitiesItems2Body: {
    defaultMessage: "Read projects, source files, and translation keys from the workspace.",
    id: "VgCXgTumiw",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #3 › body",
  },
  capabilitiesItems3Title: {
    defaultMessage: "Glossaries and guidelines",
    id: "K0b5lD+tXn",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #4 › title",
  },
  capabilitiesItems3Body: {
    defaultMessage: "Check copy against your glossary and guidelines before it is written.",
    id: "8rtHkzEE94",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #4 › body",
  },
  capabilitiesItems4Title: {
    defaultMessage: "Translation jobs",
    id: "iyjF2ZwCzs",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #5 › title",
  },
  capabilitiesItems4Body: {
    defaultMessage: "Start translation for any locale and poll it until it is done.",
    id: "OYOf5vYRKA",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #5 › body",
  },
  capabilitiesItems5Title: {
    defaultMessage: "Review items",
    id: "gKOIDBmAuX",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #6 › title",
  },
  capabilitiesItems5Body: {
    defaultMessage: "See what is blocked or waiting for review, and who owns it.",
    id: "9g2bgErVgF",
    description:
      "localisation-for-ai-coding-agents use case page: capabilities › items › #6 › body",
  },
  scenarioTitle: {
    defaultMessage: "A settings page ships in four languages without leaving the editor",
    id: "9bFThfSl9p",
    description: "localisation-for-ai-coding-agents use case page: scenario › title",
  },
  scenarioBody: {
    defaultMessage: "How one engineer adds a feature and its translations in the same session.",
    id: "ZcY5QocFzx",
    description: "localisation-for-ai-coding-agents use case page: scenario › body",
  },
  scenarioEvents0Time: {
    defaultMessage: "14:00",
    id: "Cvep83sLsp",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #1 › time",
  },
  scenarioEvents0Title: {
    defaultMessage: "The feature is built",
    id: "5bzOuzGVvw",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #1 › title",
  },
  scenarioEvents0Body: {
    defaultMessage: "An engineer adds a new settings page with Cursor, including 9 new UI strings.",
    id: "QilddlbVEc",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #1 › body",
  },
  scenarioEvents1Time: {
    defaultMessage: "14:20",
    id: "f1mPsN6Zdv",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #2 › time",
  },
  scenarioEvents1Title: {
    defaultMessage: "Copy follows the glossary",
    id: "OepygDMRZi",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #2 › title",
  },
  scenarioEvents1Body: {
    defaultMessage:
      "Before writing labels, the agent reads the glossary and uses the approved terms.",
    id: "oiG3aMmCJB",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #2 › body",
  },
  scenarioEvents2Time: {
    defaultMessage: "14:25",
    id: "hP9+JcVxHC",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #3 › time",
  },
  scenarioEvents2Title: {
    defaultMessage: "Translation starts",
    id: "pgmDMJkH5b",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #3 › title",
  },
  scenarioEvents2Body: {
    defaultMessage:
      "The agent starts translation for German, French, Japanese, and Spanish from the same chat.",
    id: "UC0Pm35Zdc",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #3 › body",
  },
  scenarioEvents3Time: {
    defaultMessage: "16:00",
    id: "XTRqcTqE85",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #4 › time",
  },
  scenarioEvents3Title: {
    defaultMessage: "Ready for review",
    id: "FC4rQEEU7n",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #4 › title",
  },
  scenarioEvents3Body: {
    defaultMessage:
      "The engineer asks for status, opens the review link for one flagged string, and opens the pull request.",
    id: "x2UuqyNGFq",
    description: "localisation-for-ai-coding-agents use case page: scenario › events › #4 › body",
  },
  ctaHeadline: {
    defaultMessage: "Give your coding agent your localisation workspace",
    id: "3yJMzZodw1",
    description: "localisation-for-ai-coding-agents use case page: cta › headline",
  },
  ctaBody: {
    defaultMessage:
      "Start free, connect Claude Code, Codex, or Cursor in one command, and ask your first question.",
    id: "7KYhPstvD8",
    description: "localisation-for-ai-coding-agents use case page: cta › body",
  },
});

export const localisationForAiCodingAgentsStory: UseCaseStory = {
  slug: "localisation-for-ai-coding-agents",
  hero: {
    headline: m.heroHeadline,
    body: m.heroBody,
    visual: {
      kind: "composition",
      primary: {
        kind: "chat",
        client: "claude",
        title: m.heroVisualPrimaryTitle,
        messages: [
          {
            from: "user",
            text: m.heroVisualPrimaryMessages0Text,
          },
          {
            from: "agent",
            text: m.heroVisualPrimaryMessages1Text,
          },
        ],
        tools: [
          {
            name: "list_projects",
            detail: m.heroVisualPrimaryTools0Detail,
            status: "done",
          },
          {
            name: "get_glossary_entries",
            detail: m.heroVisualPrimaryTools1Detail,
            status: "done",
          },
          {
            name: "run_workflow",
            detail: m.heroVisualPrimaryTools2Detail,
            status: "running",
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
            status: "warn",
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
              text: "claude mcp add -t http hyperlocalise https://hyperlocalise.com/mcp",
            },
            {
              kind: "ok",
              text: "✓ Added HTTP MCP server hyperlocalise",
            },
            {
              kind: "dim",
              text: "Opening your browser to approve access…",
            },
            {
              kind: "ok",
              text: "✓ Connected",
            },
          ],
        },
      },
      {
        title: m.guideSteps1Title,
        body: m.guideSteps1Body,
        visual: {
          kind: "chat",
          client: "codex",
          title: m.guideSteps1VisualTitle,
          messages: [
            {
              from: "user",
              text: m.guideSteps1VisualMessages0Text,
            },
            {
              from: "agent",
              text: m.guideSteps1VisualMessages1Text,
            },
          ],
          tools: [
            {
              name: "list_projects",
              detail: m.guideSteps1VisualTools0Detail,
              status: "done",
            },
          ],
        },
      },
      {
        title: m.guideSteps2Title,
        body: m.guideSteps2Body,
        visual: {
          kind: "chat",
          client: "cursor",
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
          tools: [
            {
              name: "get_glossary_entries",
              detail: m.guideSteps2VisualTools0Detail,
              status: "done",
            },
            {
              name: "run_workflow",
              detail: m.guideSteps2VisualTools1Detail,
              status: "running",
            },
          ],
        },
      },
      {
        title: m.guideSteps3Title,
        body: m.guideSteps3Body,
        visual: {
          kind: "chat",
          client: "claude",
          title: m.guideSteps3VisualTitle,
          messages: [
            {
              from: "user",
              text: m.guideSteps3VisualMessages0Text,
            },
            {
              from: "agent",
              text: m.guideSteps3VisualMessages1Text,
            },
          ],
          tools: [
            {
              name: "get_job",
              detail: m.guideSteps3VisualTools0Detail,
              status: "warn",
            },
          ],
        },
      },
    ],
  },
  integrations: {
    title: m.integrationsTitle,
    ids: ["anthropic", "openai", "github", "slack", "phrase", "crowdin", "lokalise", "gemini"],
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
