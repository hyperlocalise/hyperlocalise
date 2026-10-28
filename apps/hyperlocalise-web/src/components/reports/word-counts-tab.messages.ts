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

export const wordCountsTabMessages = defineMessages({
  chartTitle: {
    id: "h//olRg5WR",
    defaultMessage: "Volume over time",
    description: "Title of the chart of words over time on the Word counts tab",
  },
  chartArrived: {
    id: "m511Tx3pYg",
    defaultMessage: "{unit} that arrived.",
    description:
      "Start of the volume chart's subtitle; unit is Words, Strings, Characters or Characters with spaces",
  },
  chartFinished: {
    id: "zh0FmhKnEx",
    defaultMessage: "{unit} finished.",
    description:
      "Start of the volume chart's subtitle; unit is Words, Strings, Characters or Characters with spaces",
  },
  chartRanked: {
    id: "n2z25OQZ4/",
    defaultMessage: "The five largest on their own, the rest as Other.",
    description: "Part of the volume chart's subtitle when it is split by project or language",
  },
  chartDays: {
    id: "dSYoXf1ZmK",
    defaultMessage: "Days are in UTC.",
    description: "End of the volume chart's subtitle when each bar is a day",
  },
  chartWeeks: {
    id: "+hYYLxqhyj",
    defaultMessage: "Weeks start on Monday, UTC.",
    description: "End of the volume chart's subtitle when each bar is a week",
  },
  chartMonths: {
    id: "RIo5f8K5b1",
    defaultMessage: "Months are in UTC.",
    description: "End of the volume chart's subtitle when each bar is a month",
  },
  chartSummary: {
    id: "p2Vp6IJsFD",
    defaultMessage: "{unit} from {from} to {to}, {total} in all",
    description: "Accessible summary of the volume chart",
  },
  otherSeries: {
    id: "olyAMClAtW",
    defaultMessage: "Other",
    description: "Chart series: every project or language outside the largest five",
  },
  splitBy: {
    id: "xrpEZKmKg+",
    defaultMessage: "Split by",
    description: "Accessible name of the switch for what the volume chart splits each bar by",
  },
  splitProject: {
    id: "xunumski1w",
    defaultMessage: "Project",
    description: "Switch option: split the volume chart by project",
  },
  splitLanguage: {
    id: "2UkCldKrBp",
    defaultMessage: "Language",
    description: "Switch option: split the volume chart by target language",
  },
  splitBand: {
    id: "dmuUuHeEhY",
    defaultMessage: "Match band",
    description: "Switch option: split the volume chart by how closely the memory matched",
  },
  splitTaskStep: {
    id: "uqPSxjADNC",
    defaultMessage: "Task step",
    description:
      "Switch option: split the volume chart by what each task is for (translate, post-edit, proofread)",
  },
  barLength: {
    id: "g9CgwTP/g8",
    defaultMessage: "Each bar",
    description: "Accessible name of the switch for how long each bar of the volume chart covers",
  },
  perDay: {
    id: "vUpaRCOaDt",
    defaultMessage: "Day",
    description: "Switch option: one bar per day",
  },
  perWeek: {
    id: "Bqnz/kegRF",
    defaultMessage: "Week",
    description: "Switch option: one bar per week",
  },
  perMonth: {
    id: "IGV7fp+8Wg",
    defaultMessage: "Month",
    description: "Switch option: one bar per month",
  },
  tierExact: {
    id: "tcERRXsJX4",
    defaultMessage: "100% and repetitions",
    description: "Chart series: exact memory matches and text repeated within the work",
  },
  tierHigh: {
    id: "Il86AJwkAb",
    defaultMessage: "95–99%",
    description: "Chart series: memory matches from 95 to 99 percent",
  },
  tierFuzzy: {
    id: "dJlHvgegsd",
    defaultMessage: "75–94%",
    description: "Chart series: memory matches from 75 to 94 percent",
  },
  tierLow: {
    id: "KyCxU8oF0o",
    defaultMessage: "50–74%",
    description: "Chart series: memory matches from 50 to 74 percent",
  },
  tierNew: {
    id: "a4ePFrRE7N",
    defaultMessage: "New",
    description:
      "Chart series: text with no memory match of 50 percent or more, or whose memory could not be read",
  },
  bandsTitle: {
    id: "m/ztao2VI0",
    defaultMessage: "Match bands",
    description: "Title of the list of each match band's share of the word counts",
  },
  bandsDetail: {
    id: "rejQNKMnC3",
    defaultMessage: "{unit} in each band across every row of the table.",
    description:
      "Subtitle of the match band list; unit is Words, Strings, Characters or Characters with spaces",
  },
  bandShare: {
    id: "rc40kfyukr",
    defaultMessage: "{band}: {count}, {share}",
    description: "Accessible text of one match band in the list: its name, count and share",
  },
  whichWords: {
    id: "+A4wJ1M5iF",
    defaultMessage: "Which words",
    description: "Accessible name of the switch between words that arrived and words finished",
  },
  arrived: {
    id: "zm9BDqNIqk",
    defaultMessage: "Arrived",
    description: "Switch option: words that arrived in the dates",
  },
  finished: {
    id: "krjDqQcSBp",
    defaultMessage: "Finished",
    description: "Switch option: words finished in the dates",
  },
  groupBy: {
    id: "1YE4km/3/U",
    defaultMessage: "Group by",
    description: "Accessible name of the switch between grouping by project and by task",
  },
  byProject: {
    id: "YkwSAxcqlH",
    defaultMessage: "By project",
    description: "Switch option: one row per project and language",
  },
  byTask: {
    id: "EbGnMEBPzr",
    defaultMessage: "By task",
    description: "Switch option: one row per task and language",
  },
  byWeek: {
    id: "YbYXjpZ0kP",
    defaultMessage: "By week",
    description: "Switch option: one row per week, project and language",
  },
  byLanguage: {
    id: "tc7k+8PSRk",
    defaultMessage: "By language",
    description: "Switch option: one row per target language, across projects",
  },
  byTaskStep: {
    id: "ZlnZc+rg+I",
    defaultMessage: "By task step",
    description:
      "Switch option: one row per task step (translate, post-edit, proofread) and language",
  },
  weekColumn: {
    id: "7CPlHFJKgc",
    defaultMessage: "Week",
    description: "Column heading: the week, by its first day",
  },
  weekOf: {
    id: "wE6tyGO5i/",
    defaultMessage: "Week of {date}",
    description: "A week in the word counts table, by its first day (a Monday)",
  },
  projectColumn: {
    id: "awb3jIA7pt",
    defaultMessage: "Project",
    description: "Column heading: the project",
  },
  taskColumn: {
    id: "lr+kB76/+I",
    defaultMessage: "Task",
    description: "Column heading: the task",
  },
  taskStepColumn: {
    id: "YmDPiD+yJD",
    defaultMessage: "Task step",
    description: "Column heading: what the work's task is for (translate, post-edit, proofread)",
  },
  languageColumn: {
    id: "wNTnMH8vtk",
    defaultMessage: "Language",
    description: "Column heading: the target language",
  },
  totalColumn: {
    id: "ALSsJ0tpm6",
    defaultMessage: "Total",
    description: "Column heading: the row's total",
  },
  noTask: {
    id: "yR1mPYr/0l",
    defaultMessage: "No task (content editor)",
    description: "Row for work saved in the content editor outside any task",
  },
  deletedTask: {
    id: "SwaFbJXUb9",
    defaultMessage: "Deleted task",
    description: "Row for a task that no longer exists",
  },
  arrivedNote: {
    id: "jdQpL3Ol9L",
    defaultMessage:
      "{unit} that arrived in these dates, by match band. Each string counts once per language, in its current version.",
    description: "Note above the word counts table when showing work that arrived",
  },
  finishedNote: {
    id: "D7GsIrrRnU",
    defaultMessage:
      "{unit} finished in these dates, by match band, each time a string was finished.",
    description: "Note above the word counts table when showing finished work",
  },
  charactersNote: {
    id: "i7u8SkwkJO",
    defaultMessage:
      "Characters suit languages written without spaces, such as Chinese and Japanese.",
    description: "Note added when counting characters",
  },
  tableLabel: {
    id: "TmuH5whY3N",
    defaultMessage: "Word counts",
    description: "Accessible name of the word counts table",
  },
});
