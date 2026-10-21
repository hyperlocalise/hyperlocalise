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

export const wordCountReportMessages = defineMessages({
  matchAnalysisTitle: {
    id: "7ok0FwYH8e",
    defaultMessage: "Match analysis",
    description: "Heading of a task's word counts by translation memory match band and language",
  },
  matchAnalysisHelp: {
    id: "0GVTDnDu3O",
    defaultMessage:
      "Words in this task by how closely each string matches the translation memory. Analysed counts every string; completed counts the strings finished so far.",
    description: "Explains the match analysis table on a task",
  },
  totalsTitle: {
    id: "YxBjtdP+3h",
    defaultMessage: "Word totals",
    description: "Heading of the word count totals per project or task and language",
  },
  totalsHelp: {
    id: "O//v61r/CU",
    defaultMessage:
      "Analysed words arrived in the selected dates; completed words were finished in them.",
    description: "Explains the analysed and completed columns of the word totals table",
  },
  groupByProject: {
    id: "xAlLg25Oit",
    defaultMessage: "By project",
    description: "Option that groups word totals by project and language",
  },
  groupByJob: {
    id: "kquG88PkJ/",
    defaultMessage: "By task",
    description: "Option that groups word totals by task and language",
  },
  project: {
    id: "D/P7jcPX6N",
    defaultMessage: "Project",
    description: "Column heading for the project in word totals",
  },
  task: {
    id: "6v890tkADV",
    defaultMessage: "Task",
    description: "Column heading for the task in word totals",
  },
  language: {
    id: "g2o/hsKJuI",
    defaultMessage: "Language",
    description: "Column heading for the target language in word count tables",
  },
  band: {
    id: "yK06fjIU98",
    defaultMessage: "Match",
    description: "Column heading for the translation memory match band",
  },
  analysedWords: {
    id: "PeItGF+xHY",
    defaultMessage: "Analysed words",
    description: "Column heading: words in all analysed strings",
  },
  analysedSegments: {
    id: "CTRL6DN6OP",
    defaultMessage: "Analysed strings",
    description: "Column heading: number of analysed strings",
  },
  completedWords: {
    id: "6F/vYHlbGE",
    defaultMessage: "Completed words",
    description: "Column heading: words in strings finished so far",
  },
  completedSegments: {
    id: "9UNEz67Z9a",
    defaultMessage: "Completed strings",
    description: "Column heading: number of strings finished so far",
  },
  total: {
    id: "FRHhBDzBHT",
    defaultMessage: "Total",
    description: "Label of a row adding up the rows above it in a word count table",
  },
  noAnalysis: {
    id: "uuColj1sEx",
    defaultMessage: "This task has not been analysed yet.",
    description: "Shown when a task has no word count analysis",
  },
  noTotals: {
    id: "CQ8Vw4M4E/",
    defaultMessage: "No words in the selected dates.",
    description: "Shown when the word totals table has no rows",
  },
  downloadCsv: {
    id: "prbMIFlfY5",
    defaultMessage: "Download CSV",
    description: "Button that downloads a word count table as a CSV file",
  },
  loadError: {
    id: "ricOYRLhS+",
    defaultMessage: "Word counts could not be loaded.",
    description: "Shown when a word count table fails to load",
  },
});
