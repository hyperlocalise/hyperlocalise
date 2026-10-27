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
    id: "GxPcu+zAsz",
    defaultMessage: "Volume per week",
    description: "Title of the chart of words per week by project on the Word counts tab",
  },
  chartArrivedDetail: {
    id: "CD1RIiB61n",
    defaultMessage:
      "{unit} that arrived each week, by project: the five largest on their own, the rest as Other. Weeks start on Monday, UTC.",
    description:
      "Subtitle of the volume chart when it shows words that arrived; unit is Words, Strings, Characters or Characters with spaces",
  },
  chartFinishedDetail: {
    id: "4hQ7P5mkNM",
    defaultMessage:
      "{unit} finished each week, by project: the five largest on their own, the rest as Other. Weeks start on Monday, UTC.",
    description:
      "Subtitle of the volume chart when it shows words finished; unit is Words, Strings, Characters or Characters with spaces",
  },
  chartSummary: {
    id: "ikD95xrdV0",
    defaultMessage: "{unit} by week from {from} to {to}, {total} in all",
    description: "Accessible summary of the volume chart",
  },
  otherProjects: {
    id: "x8Pmk18eDT",
    defaultMessage: "Other",
    description: "Chart series: every project outside the largest five",
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
