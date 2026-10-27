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
"use client";

import { defineMessages } from "react-intl";

export const activityTabMessages = defineMessages({
  sourceWords: {
    id: "SRJvcrQLW0",
    defaultMessage: "Source words",
    description: "Activity card: words of source text that arrived, each text counted once",
  },
  sourceWordsDetail: {
    id: "WaNJ4aXPOt",
    defaultMessage: "Unique words that arrived, translation step",
    description: "Detail under the source words card",
  },
  wordsToTranslate: {
    id: "afxCn+1ZKq",
    defaultMessage: "Words to translate",
    description: "Activity card: source words times the languages they go into",
  },
  wordsToTranslateDetail: {
    id: "/QuCM2WH7H",
    defaultMessage: "Source words × their languages",
    description: "Detail under the words to translate card",
  },
  wordsFinished: {
    id: "zqxYomx0Lt",
    defaultMessage: "Words finished",
    description: "Activity card: words translated in the chosen dates",
  },
  wordsFinishedDetail: {
    id: "U0tjqKI8s2",
    defaultMessage: "Translation step only",
    description: "Detail under the words finished card",
  },
  progress: {
    id: "3UK3mwksnd",
    defaultMessage: "Progress",
    description: "Activity card: share of the arrived words that are finished",
  },
  progressDetail: {
    id: "hbZPBR2/zu",
    defaultMessage: "Of the words that arrived in these dates",
    description: "Detail under the progress card",
  },
  wordsReviewed: {
    id: "FP74d1HjBN",
    defaultMessage: "Words reviewed",
    description: "Activity card: words approved in the period, at the review step",
  },
  wordsReviewedDetail: {
    id: "DN1I9bj4t4",
    defaultMessage: "Approved in these dates · review step",
    description: "Detail under the words reviewed card",
  },
  chartStep: {
    id: "a6JR5uFWOp",
    defaultMessage: "Step",
    description: "Label of the switch choosing which step the finished words chart shows",
  },
  finishedPerDay: {
    id: "XDo7GTXYVG",
    defaultMessage: "Finished words per day",
    description: "Title of the chart of finished words for each day",
  },
  finishedPerWeek: {
    id: "u1jIBm+6lH",
    defaultMessage: "Finished words per week",
    description: "Title of the chart of finished words for each week",
  },
  finishedChartDetail: {
    id: "FNPiHoJg9V",
    defaultMessage: "{step} step · by where the text came from",
    description: "Subtitle of the finished words chart",
  },
  fromMemory: {
    id: "HqGUF6r5uP",
    defaultMessage: "Translation memory",
    description: "Chart series: finished text taken from the translation memory",
  },
  fromAi: {
    id: "AR6134JvR2",
    defaultMessage: "AI",
    description: "Chart series: finished text written by an AI model",
  },
  fromImport: {
    id: "hDeWLLJPZV",
    defaultMessage: "Imported",
    description: "Chart series: finished text that was imported",
  },
  fromUnknown: {
    id: "3cKXuel9Qg",
    defaultMessage: "Not recorded",
    description: "Chart series: finished text whose source was not recorded",
  },
  unchangedNote: {
    id: "s97IP+3F+5",
    defaultMessage:
      "People finished {people} words at the {step} step; {share} of those kept the text they were given as it was.",
    description:
      "Note under the finished words chart: how much of what people finished was kept as given",
  },
  people: {
    id: "WvlADP+aHH",
    defaultMessage: "Written by people",
    description: "Chart series: finished text that people wrote themselves",
  },
  automatic: {
    id: "jVog1L+ji6",
    defaultMessage: "Automatic",
    description: "Chart series: work done automatically",
  },
  chartSummary: {
    id: "1N8A6OFNKq",
    defaultMessage:
      "{finished} words finished from {from} to {to}, {people} of them by people, by where the text came from",
    description: "Accessible description of the finished words chart",
  },
  weekOf: {
    id: "7nK/m58QnJ",
    defaultMessage: "Week of {date}",
    description: "Chart label for a week, by its first day",
  },
  finishedByLanguage: {
    id: "1I5rpsAmJB",
    defaultMessage: "Finished words by language",
    description: "Title of the list of finished words for each language",
  },
  finishedByLanguageDetail: {
    id: "pgKfGrCl0q",
    defaultMessage: "{step} step",
    description: "Subtitle of the finished words by language list",
  },
  stepTimes: {
    id: "OrrrzJPB4V",
    defaultMessage: "Time on each step",
    description: "Title of the table of time spent per step",
  },
  stepTimesDetail: {
    id: "ynP3RQlErz",
    defaultMessage: "Logged by people, and run time of automated steps",
    description: "Subtitle of the time on each step table",
  },
  stepColumn: {
    id: "G483RkGMWe",
    defaultMessage: "Step",
    description: "Column heading: the step",
  },
  timeColumn: {
    id: "9KWpst0O1R",
    defaultMessage: "Time",
    description: "Column heading: time spent",
  },
  whoColumn: {
    id: "9omEGD7x49",
    defaultMessage: "Who or runs",
    description: "Column heading: how many people logged time, or how many runs there were",
  },
  loggedStep: {
    id: "qm69Nmggik",
    defaultMessage: "{step} (logged)",
    description: "A step whose time people logged",
  },
  taskRuns: {
    id: "ZRW72rNvup",
    defaultMessage: "Translation task runs",
    description: "Automated time: translation tasks from start to finish",
  },
  workflowStep: {
    id: "LMZ8bk3MgG",
    defaultMessage: "Workflow: {step}",
    description: "Automated time: a step of a visual workflow",
  },
  peopleCount: {
    id: "PatbUgdWQn",
    defaultMessage: "{count, plural, one {# person} other {# people}}",
    description: "How many people logged time",
  },
  runsCount: {
    id: "DuSuCv67tO",
    defaultMessage: "{count, plural, one {# run} other {# runs}}",
    description: "How many automated runs there were",
  },
  aiUsageFiltersNote: {
    id: "UyCh2vthT/",
    defaultMessage:
      "AI usage follows the dates and project only, not the task, language or step chosen.",
    description: "Note on AI usage while a task or language filter is set",
  },
  automatedFiltersNote: {
    id: "W7VsUBEm6f",
    defaultMessage:
      "Automated run time follows the dates and project only, not the task, language or step chosen.",
    description: "Note on automated step time while a task or language filter is set",
  },
  aiUsage: {
    id: "rS5rFYTVd7",
    defaultMessage: "AI usage",
    description: "Title of the AI usage section",
  },
  aiUsageDetail: {
    id: "QrtyL5iy/N",
    defaultMessage: "Tokens by where the AI was called. Includes calls on your own provider key.",
    description: "Subtitle of the AI usage section",
  },
  groupAiUsage: {
    id: "AYIgoL7Tqr",
    defaultMessage: "Group AI usage by",
    description: "Accessible name of the switch between AI usage by origin and by model",
  },
  byOrigin: {
    id: "z/EZ/oiPp3",
    defaultMessage: "By origin",
    description: "Switch option: AI usage by where it was called",
  },
  byModel: {
    id: "DJlDyykpu4",
    defaultMessage: "By model",
    description: "Switch option: AI usage by model",
  },
  originColumn: {
    id: "FJBWKJtCOV",
    defaultMessage: "Origin",
    description: "Column heading: where AI was called",
  },
  modelColumn: {
    id: "1PoSOMSmLa",
    defaultMessage: "Model",
    description: "Column heading: the AI model",
  },
  callsColumn: {
    id: "QpdOZpNasy",
    defaultMessage: "Calls",
    description: "Column heading: number of AI calls",
  },
  inputColumn: {
    id: "2PDVG4rXQ7",
    defaultMessage: "Input tokens",
    description: "Column heading: tokens sent to the model",
  },
  outputColumn: {
    id: "1OvUY7tBML",
    defaultMessage: "Output tokens",
    description: "Column heading: tokens the model returned",
  },
  modelsColumn: {
    id: "kAxUWHx06W",
    defaultMessage: "Models",
    description: "Column heading: models used",
  },
  channelsColumn: {
    id: "VlAhu8wiQm",
    defaultMessage: "Channels",
    description: "Column heading: how the AI was reached",
  },
  originsColumn: {
    id: "yMrFC+/mC2",
    defaultMessage: "Origins",
    description: "Column heading: where a model was called",
  },
  imagesCount: {
    id: "8+9j1NEhxA",
    defaultMessage: "{count, plural, one {# image} other {# images}}",
    description: "How many images were made with AI",
  },
  videosCount: {
    id: "5ZayxXnoLj",
    defaultMessage: "{count, plural, one {# video} other {# videos}}",
    description: "How many videos were made with AI",
  },
  mediaCalls: {
    id: "flylKYuIkP",
    defaultMessage: "{images} · {videos}",
    description: "Calls column for media: the counts of images and of videos made, already worded",
  },
  origin_translation: {
    id: "+LTWFvOwuo",
    defaultMessage: "Translation",
    description: "AI origin: translating content",
  },
  origin_review_and_qa: {
    id: "jfxaOQ3kwn",
    defaultMessage: "Review and QA",
    description: "AI origin: reviewing and checking translations",
  },
  origin_images_and_video: {
    id: "zGaGxn7T4v",
    defaultMessage: "Images and video",
    description: "AI origin: localising images and videos",
  },
  origin_assistants_and_chat: {
    id: "cY7ieh5gRY",
    defaultMessage: "Assistants and chat",
    description: "AI origin: chat and assistants",
  },
  origin_building_automations: {
    id: "4vVKnDID+V",
    defaultMessage: "Building automations",
    description: "AI origin: the assistant that builds automations",
  },
  origin_running_automations: {
    id: "2zoLhgI6WQ",
    defaultMessage: "Running automations",
    description: "AI origin: automations as they run",
  },
  origin_other: {
    id: "lYGZ/1ylRT",
    defaultMessage: "Other",
    description: "AI origin: anything else",
  },
  channel_app: {
    id: "IR5pE8HjYQ",
    defaultMessage: "App",
    description: "AI channel: the Hyperlocalise app",
  },
  channel_api: {
    id: "NUblgEq2S7",
    defaultMessage: "API",
    description: "AI channel: the public API",
  },
  channel_slack: {
    id: "UiXOndyUc4",
    defaultMessage: "Slack",
    description: "AI channel: Slack",
  },
  channel_email: {
    id: "smwYSK2Q3d",
    defaultMessage: "Email",
    description: "AI channel: email",
  },
  channel_web_chat: {
    id: "HhB3zV2KR/",
    defaultMessage: "Web chat",
    description: "AI channel: the public web chat",
  },
  channel_github: {
    id: "mX5rAoAEt+",
    defaultMessage: "GitHub",
    description: "AI channel: GitHub",
  },
  channel_gitlab: {
    id: "GgeiMXRkUs",
    defaultMessage: "GitLab",
    description: "AI channel: GitLab",
  },
  channel_contentful: {
    id: "Yvpi2I1ADA",
    defaultMessage: "Contentful",
    description: "AI channel: Contentful",
  },
  channel_connected_tms: {
    id: "SX3nxPtYJ2",
    defaultMessage: "Connected TMS",
    description: "AI channel: a connected translation management system",
  },
  channel_automation: {
    id: "CSGDCZep86",
    defaultMessage: "Automations",
    description: "AI channel: automations",
  },
  noAiUsage: {
    id: "fMv+rsdxOk",
    defaultMessage: "No AI was used in these dates.",
    description: "Shown when there is no AI usage",
  },
});
