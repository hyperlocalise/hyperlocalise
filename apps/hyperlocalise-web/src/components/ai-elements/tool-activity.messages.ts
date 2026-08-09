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
    id: "n3a+6mF2IX",
    defaultMessage: "Searching",
    description: "Live explore status when the agent is searching without a subject",
  },
  searchingDetail: {
    id: "yJSROTn1AA",
    defaultMessage: "Searching {detail}",
    description: "Live explore status when the agent is searching for a subject",
  },
  reading: {
    id: "ufFJx4vPTD",
    defaultMessage: "Reading",
    description: "Live explore status when the agent is reading a file without a subject",
  },
  readingDetail: {
    id: "JRvO1zUFRY",
    defaultMessage: "Reading {detail}",
    description: "Live explore status when the agent is reading a named file",
  },
  findingFiles: {
    id: "m8UlToMOXC",
    defaultMessage: "Finding files",
    description: "Live explore status when the agent is listing files without a pattern",
  },
  findingDetail: {
    id: "/iIPpWEOXd",
    defaultMessage: "Finding {detail}",
    description: "Live explore status when the agent is listing files with a pattern",
  },
  checkingRepoConfig: {
    id: "zLa51T7B2l",
    defaultMessage: "Checking repository config",
    description: "Live explore status when the agent inspects repository localization config",
  },
  checkingGitHistory: {
    id: "fFie7livIj",
    defaultMessage: "Checking git history",
    description: "Live explore status when the agent inspects git history",
  },
  working: {
    id: "U9HdNspgPF",
    defaultMessage: "Working…",
    description: "Fallback live explore status for an unknown explore tool",
  },
  exploredSubject: {
    id: "6V8CrxumwV",
    defaultMessage:
      "{count, plural, one {Explored {subject}, # search} other {Explored {subject}, # searches}}",
    description: "Collapsed explore rollup with a subject and search count",
  },
  exploredCodebase: {
    id: "40cOR2CWgx",
    defaultMessage:
      "{count, plural, one {Explored the codebase, # search} other {Explored the codebase, # searches}}",
    description: "Collapsed explore rollup without a subject",
  },
  openedFile: {
    id: "4f79gyGj6Q",
    defaultMessage: "Opened {subject}",
    description: "Collapsed explore rollup for a single file read",
  },
  openedFiles: {
    id: "PtTFfFyjEn",
    defaultMessage: "{count, plural, one {Opened # file} other {Opened # files}}",
    description: "Collapsed explore rollup for multiple file reads",
  },
});
