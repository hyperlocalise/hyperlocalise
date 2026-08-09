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

export const toolActivityMessages = defineMessages({
  searching: {
    id: "tActSearch00",
    defaultMessage: "Searching",
    description: "Live explore status when the agent is searching without a subject",
  },
  searchingDetail: {
    id: "tActSearch01",
    defaultMessage: "Searching {detail}",
    description: "Live explore status when the agent is searching for a subject",
  },
  reading: {
    id: "tActRead0000",
    defaultMessage: "Reading",
    description: "Live explore status when the agent is reading a file without a subject",
  },
  readingDetail: {
    id: "tActRead0001",
    defaultMessage: "Reading {detail}",
    description: "Live explore status when the agent is reading a named file",
  },
  findingFiles: {
    id: "tActFind0000",
    defaultMessage: "Finding files",
    description: "Live explore status when the agent is listing files without a pattern",
  },
  findingDetail: {
    id: "tActFind0001",
    defaultMessage: "Finding {detail}",
    description: "Live explore status when the agent is listing files with a pattern",
  },
  checkingRepoConfig: {
    id: "tActRepoCfg0",
    defaultMessage: "Checking repository config",
    description: "Live explore status when the agent inspects repository localization config",
  },
  checkingGitHistory: {
    id: "tActGitHist0",
    defaultMessage: "Checking git history",
    description: "Live explore status when the agent inspects git history",
  },
  working: {
    id: "tActWorking0",
    defaultMessage: "Working…",
    description: "Fallback live explore status for an unknown explore tool",
  },
  exploredSubject: {
    id: "tActExplrd0",
    defaultMessage:
      "{count, plural, one {Explored {subject}, # search} other {Explored {subject}, # searches}}",
    description: "Collapsed explore rollup with a subject and search count",
  },
  exploredCodebase: {
    id: "tActExplrd1",
    defaultMessage:
      "{count, plural, one {Explored the codebase, # search} other {Explored the codebase, # searches}}",
    description: "Collapsed explore rollup without a subject",
  },
  openedFile: {
    id: "tActOpen000",
    defaultMessage: "Opened {subject}",
    description: "Collapsed explore rollup for a single file read",
  },
  openedFiles: {
    id: "tActOpen001",
    defaultMessage: "{count, plural, one {Opened # file} other {Opened # files}}",
    description: "Collapsed explore rollup for multiple file reads",
  },
});
