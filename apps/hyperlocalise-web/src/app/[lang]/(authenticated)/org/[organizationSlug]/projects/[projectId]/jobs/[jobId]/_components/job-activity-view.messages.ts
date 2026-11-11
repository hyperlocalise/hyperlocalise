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

export const jobActivityViewMessages = defineMessages({
  heading: {
    defaultMessage: "Activity",
    id: "6Ma87mDCYW",
    description: "Heading for the job detail activity feed",
  },
  loadFailed: {
    defaultMessage: "Couldn't load activity. It will retry automatically.",
    id: "OLgatkW3x/",
    description: "Inline error when the job activity feed fails to load",
  },
  someone: {
    defaultMessage: "A teammate",
    id: "3fpFVZYcRd",
    description: "Fallback actor name in the job activity feed when the user is unknown",
  },
  jobCreatedBy: {
    defaultMessage: "{name} created the job",
    id: "gX54LrfjA7",
    description: "Job activity row for job creation by a person",
  },
  jobCreated: {
    defaultMessage: "Job created",
    id: "MuUohGqmxo",
    description: "Job activity row for job creation without a known creator",
  },
  jobCancelled: {
    defaultMessage: "{name} cancelled the job",
    id: "jhOfPn0iZ0",
    description: "Job activity row when a user cancels the job",
  },
  jobRetried: {
    defaultMessage: "{name} retried the job",
    id: "e20COVbVmV",
    description: "Job activity row when a user retries the job",
  },
  jobMarkedFailed: {
    defaultMessage: "{name} marked the job as failed",
    id: "RWcK8ZIk5R",
    description: "Job activity row when a user marks the job as failed",
  },
  jobMarkedDone: {
    defaultMessage: "{name} marked the task as done",
    id: "zLb2OYI9oM",
    description: "Job activity row when a user marks a task for people as done",
  },
  agentName: {
    defaultMessage: "Hyperlocalise agent",
    id: "dQxtOIUn2A",
    description: "Name of the translation agent shown on a job run card",
  },
  runStarted: {
    defaultMessage: "{agent} started {time}",
    id: "rknk+HH7iw",
    description:
      "Run card header suffix with relative start time, for example 'started 5 minutes ago'",
  },
  stagePreparing: {
    defaultMessage: "Preparing",
    id: "+aCQ19Fp2o",
    description: "Run card badge while the agent prepares context and extracts strings",
  },
  stageTranslating: {
    defaultMessage: "Translating",
    id: "Rw04N6I1lw",
    description: "Run card badge while the agent translates",
  },
  stageSucceeded: {
    defaultMessage: "Finished",
    id: "MaPXv2K8dr",
    description: "Run card badge when the run finished",
  },
  stageFailed: {
    defaultMessage: "Failed",
    id: "V4zX8cf/Kp",
    description: "Run card badge when the run failed",
  },
  stageStopped: {
    defaultMessage: "Stopped",
    id: "Y6oA9iy1qW",
    description:
      "Run card badge when the run ended without finishing, for example after cancellation",
  },
  summaryPreparing: {
    defaultMessage: "Loading glossary and translation memory, then reading the file.",
    id: "hBN2q81ova",
    description: "Run card summary before strings are extracted",
  },
  summaryExtracted: {
    defaultMessage: "Found {strings, plural, one {# string} other {# strings}} to translate.",
    id: "GweWalaerg",
    description: "Run card summary after the file was read",
  },
  summaryTranslating: {
    defaultMessage:
      "{done} of {total, plural, one {# locale} other {# locales}} done. Translating the rest.",
    id: "gjJjblKPww",
    description: "Run card summary while translation is in progress",
  },
  summarySucceeded: {
    defaultMessage: "Translated {done} of {total, plural, one {# locale} other {# locales}}.",
    id: "4ciFI7Zk4c",
    description: "Run card summary when the run finished",
  },
  summaryFailed: {
    defaultMessage: "The run failed before all locales were translated.",
    id: "LUAw9P2inM",
    description: "Run card summary when the run failed",
  },
  summaryStopped: {
    defaultMessage: "The run stopped before it finished.",
    id: "e/aUV0X6JD",
    description: "Run card summary when the run ended without a result",
  },
  localeProgress: {
    defaultMessage: "{translated} / {total}",
    id: "czm5IZPRF8",
    description: "Per-locale translated string count out of total, for example '120 / 340'",
  },
  localeReused: {
    defaultMessage: "{count} reused",
    id: "sfhtDmbrI3",
    description:
      "Per-locale count of strings reused from translation memory or existing translations",
  },
  localeStatusPending: {
    defaultMessage: "Waiting",
    id: "HLsBym6CGz",
    description: "Accessible label for a locale that has not started translating",
  },
  localeStatusTranslating: {
    defaultMessage: "Translating",
    id: "lxpGDA483/",
    description: "Accessible label for a locale that is translating",
  },
  localeStatusRetrying: {
    defaultMessage: "Retrying",
    id: "SuWouxpjlP",
    description: "Label for a locale being retried on its own after a batch problem",
  },
  localeStatusCompleted: {
    defaultMessage: "Done",
    id: "n7gPMTwN6R",
    description: "Accessible label for a locale whose translated file is saved",
  },
  localeStatusFailed: {
    defaultMessage: "Failed",
    id: "kFw7vBBxbz",
    description: "Accessible label for a locale that failed to translate",
  },
  showSteps: {
    defaultMessage: "Show {count, plural, one {# step} other {# steps}}",
    id: "QFuRk2UQbi",
    description: "Toggle that expands the detailed steps of a job run",
  },
  hideSteps: {
    defaultMessage: "Hide steps",
    id: "ytWb/Sb+rS",
    description: "Toggle that collapses the detailed steps of a job run",
  },
  followUpLink: {
    defaultMessage: "Remaining locales continue in a follow-up job",
    id: "p1yyW8sfHI",
    description: "Link from a run card to the follow-up job for leftover locales",
  },
  stepStarted: {
    defaultMessage: "Started translating into {count, plural, one {# locale} other {# locales}}",
    id: "/gyx1EdG+j",
    description: "Run step when the agent starts",
  },
  stepContextReady: {
    defaultMessage:
      "Loaded {count, plural, =0 {no glossary terms} one {# glossary term} other {# glossary terms}}",
    id: "MSB+AjHtlJ",
    description: "Run step after glossary and translation memory context is assembled",
  },
  stepStringsExtracted: {
    defaultMessage: "Found {count, plural, one {# string} other {# strings}} in the file",
    id: "z3bR+/cqxl",
    description: "Run step after strings are extracted from the source file",
  },
  stepTranslationsReused: {
    defaultMessage:
      "Reused {count, plural, one {# existing translation} other {# existing translations}} for {locale}",
    id: "AI6wx9mnQ/",
    description:
      "Run step when translation memory or project translations were reused for a locale",
  },
  stepLocaleRetrying: {
    defaultMessage: "Retrying {locale} on its own",
    id: "1iLZoyqURE",
    description: "Run step when a locale is retried separately after a batch problem",
  },
  stepLocaleCompleted: {
    defaultMessage: "Saved the {locale} file",
    id: "37Ob7/VqyI",
    description: "Run step when the translated file for a locale is stored",
  },
  stepLocaleFailed: {
    defaultMessage: "Couldn't translate {locale}",
    id: "/PUdIbjipz",
    description: "Run step when a locale failed",
  },
  stepSucceeded: {
    defaultMessage: "Finished the run",
    id: "51V8lUXMkN",
    description: "Run step when the run completed",
  },
  stepFailed: {
    defaultMessage: "The run failed",
    id: "i9VNU3msVg",
    description: "Run step when the run failed",
  },
});
