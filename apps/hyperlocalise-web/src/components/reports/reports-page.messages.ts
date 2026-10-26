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

export const reportsPageMessages = defineMessages({
  loadFailed: {
    id: "M40zw/nsoU",
    defaultMessage: "This report could not be loaded.",
    description: "Error shown when a section of the Reports page fails to load",
  },
  saveFailed: {
    id: "onN6IuR7qo",
    defaultMessage: "This could not be saved.",
    description: "Error shown when saving something on the Reports page fails",
  },
  retry: {
    id: "yeQSCFltFQ",
    defaultMessage: "Try again",
    description: "Button that loads a failed Reports section again",
  },
  title: {
    id: "0OJc7+rkfv",
    defaultMessage: "Reports",
    description: "Heading of the Reports page",
  },
  startedOn: {
    id: "lRRxrjNRIO",
    defaultMessage: "Reporting started {date} · Days and weeks use UTC",
    description:
      "Subtitle of the Reports page: when Reports began recording for the workspace, and that days are UTC days",
  },
  notStarted: {
    id: "UEepWsWbHg",
    defaultMessage: "Reports has not recorded any work yet · Days and weeks use UTC",
    description: "Subtitle of the Reports page before anything has been recorded",
  },
  ownTimeOnly: {
    id: "ZT+8zOrCd1",
    defaultMessage:
      "You see the time you logged. The other reports are for admins and localization managers.",
    description:
      "Note on the Reports page for roles that cannot see what work costs: they only see their own time",
  },
  freshness: {
    id: "MtHbnOz2HY",
    defaultMessage: "Counts update about every 15 minutes.",
    description: "Note on the Reports page: how recent its figures are",
  },
  languagesLink: {
    id: "h/ydXnWprX",
    defaultMessage: "For the project's state now, see Languages on the project page",
    description: "Link from a project's Reports page to the Languages panel on its overview",
  },
  summaryPending: {
    id: "c3j6tppku4",
    defaultMessage:
      "Recent work is still being counted, so the latest numbers may be a little behind.",
    description: "Note on the Reports page while recent work has not been added to the report yet",
  },
  tabActivity: {
    id: "JdvRsJUXl6",
    defaultMessage: "Activity",
    description: "Reports tab: what was done in the chosen dates",
  },
  tabWords: {
    id: "S9c343DyDX",
    defaultMessage: "Word counts",
    description: "Reports tab: words by match band",
  },
  tabTime: {
    id: "IHSbq/4pez",
    defaultMessage: "Time",
    description: "Reports tab: time logged and automated run time",
  },
  tabAi: {
    id: "Lfo/HfkA0U",
    defaultMessage: "AI usage",
    description: "Reports tab: AI calls, tokens and billing's charge",
  },
  tabCosts: {
    id: "7Lk6kDvXtT",
    defaultMessage: "Costs",
    description: "Reports tab: money spent",
  },
  tabEstimate: {
    id: "HU7m4FhTH/",
    defaultMessage: "Cost estimate",
    description: "Reports tab: what chosen tasks will cost",
  },
  tabBudgets: {
    id: "vrk+FdEagx",
    defaultMessage: "Budgets",
    description: "Reports tab: budgets per project",
  },
  tabsLabel: {
    id: "Rb4oe0xPau",
    defaultMessage: "Report",
    description: "Accessible name of the list of Reports tabs",
  },
  dates: {
    id: "pSyKKizgwi",
    defaultMessage: "Dates",
    description: "Label of the dates filter on the Reports page",
  },
  lastDays: {
    id: "UDN6VYj6Ax",
    defaultMessage: "{days} days",
    description: "Preset date range: the last N days",
  },
  customRange: {
    id: "u/eOWVmwsn",
    defaultMessage: "Custom",
    description: "Preset that lets the user choose start and end dates",
  },
  from: {
    id: "Lmv9PfPFW0",
    defaultMessage: "From",
    description: "Label of the start date field",
  },
  to: {
    id: "sMZ1bcqcwH",
    defaultMessage: "To",
    description: "Label of the end date field",
  },
  rangeText: {
    id: "hqWPlzvpZd",
    defaultMessage: "{from} – {to}",
    description: "The dates a report covers, from one day to another",
  },
  project: {
    id: "WCaurzJ1Y5",
    defaultMessage: "Project",
    description: "Label of the project filter",
  },
  allProjects: {
    id: "ewsP3JcRhN",
    defaultMessage: "All projects",
    description: "Project filter option for every project",
  },
  task: {
    id: "k5QjkRGl89",
    defaultMessage: "Task",
    description: "Label of the single task filter",
  },
  tasks: {
    id: "zvs+2APiJD",
    defaultMessage: "Tasks",
    description: "Label of the filter that picks several tasks for an estimate",
  },
  allTasks: {
    id: "pdTOfp/hWL",
    defaultMessage: "All tasks",
    description: "Task filter option for every task",
  },
  searchTasks: {
    id: "IZNNOIJHQD",
    defaultMessage: "Search tasks",
    description: "Placeholder of the task search box",
  },
  noTasks: {
    id: "UWEiDJaeSZ",
    defaultMessage: "No tasks with Reports data match.",
    description: "Shown when the task search finds nothing",
  },
  removeTask: {
    id: "ES1w+nf4mo",
    defaultMessage: "Remove {task}",
    description: "Accessible name of the button that removes a chosen task",
  },
  taskStatusQueued: {
    id: "vbFd3KgPqU",
    defaultMessage: "Queued",
    description: "A task's state in the task picker",
  },
  taskStatusRunning: {
    id: "iO1SSVXmtH",
    defaultMessage: "Running",
    description: "A task's state in the task picker",
  },
  taskStatusWaitingForReview: {
    id: "IFClcgFpBl",
    defaultMessage: "Waiting for review",
    description: "A task's state in the task picker",
  },
  taskStatusSucceeded: {
    id: "4m7wCtv70C",
    defaultMessage: "Done",
    description: "A task's state in the task picker",
  },
  taskStatusCancelled: {
    id: "3hPd/lObFe",
    defaultMessage: "Cancelled",
    description: "A task's state in the task picker",
  },
  taskStatusFailed: {
    id: "IpkrdzOV2Q",
    defaultMessage: "Failed",
    description: "A task's state in the task picker",
  },
  clearTask: {
    id: "d9GlPy5r0y",
    defaultMessage: "Show all tasks",
    description: "Accessible name of the button that clears the chosen task",
  },
  language: {
    id: "yoyVExO9DC",
    defaultMessage: "Language",
    description: "Label of the language filter",
  },
  allLanguages: {
    id: "ruUpIx8wkL",
    defaultMessage: "All languages",
    description: "Language filter option for every language",
  },
  step: {
    id: "1NKpna4SEO",
    defaultMessage: "Step",
    description: "Label of the step filter",
  },
  stepTranslation: {
    id: "fZ3nfBt9mP",
    defaultMessage: "Translation",
    description: "The translation step of a task",
  },
  stepReview: {
    id: "RyeyBYrwhA",
    defaultMessage: "Review",
    description: "The review step of a task",
  },
  rateCard: {
    id: "sYe95jJkmx",
    defaultMessage: "Rate card",
    description: "Label of the rate card filter",
  },
  noRateCards: {
    id: "CKJR347rd7",
    defaultMessage: "No rate cards yet",
    description: "Rate card filter text when the workspace has none",
  },
  manageRates: {
    id: "R5AurDxCCm",
    defaultMessage: "Manage rates",
    description: "Button that opens the rate cards panel for admins",
  },
  viewRates: {
    id: "WMV4olqj+c",
    defaultMessage: "View rates",
    description: "Button that opens the rate cards panel read-only",
  },
  unitWords: {
    id: "1lT931wc3f",
    defaultMessage: "Words",
    description: "Unit switch option: count words",
  },
  unitStrings: {
    id: "6dh6dF3EHq",
    defaultMessage: "Strings",
    description: "Unit switch option: count strings",
  },
  unitCharacters: {
    id: "6r8cuX3FOc",
    defaultMessage: "Characters",
    description: "Unit switch option: count characters without spaces",
  },
  unitCharactersWithSpaces: {
    id: "ctUsBvUQhx",
    defaultMessage: "Characters with spaces",
    description: "Unit switch option: count characters including spaces",
  },
  unitLabel: {
    id: "ccTvsJEnIB",
    defaultMessage: "Unit",
    description: "Accessible name of the unit switch",
  },
  band_repetition: {
    id: "LStr0RUzNf",
    defaultMessage: "Repetition",
    description: "Match band: strings repeated within the work",
  },
  band_100: {
    id: "CRO3i+O935",
    defaultMessage: "100%",
    description: "Match band: exact translation memory matches",
  },
  "band_95-99": {
    id: "Qn3K4+z1cy",
    defaultMessage: "95–99%",
    description: "Match band: near-exact translation memory matches",
  },
  "band_85-94": {
    id: "21BTHuKjSm",
    defaultMessage: "85–94%",
    description: "Match band: high fuzzy translation memory matches",
  },
  "band_75-84": {
    id: "fr8STrS4dG",
    defaultMessage: "75–84%",
    description: "Match band: fuzzy translation memory matches",
  },
  "band_50-74": {
    id: "ZmAOYHuvP1",
    defaultMessage: "50–74%",
    description: "Match band: low fuzzy translation memory matches",
  },
  band_new: {
    id: "0qhb2tQ4rM",
    defaultMessage: "New",
    description: "Match band: no useful translation memory match",
  },
  band_unavailable: {
    id: "Xu+vOrX3nX",
    defaultMessage: "Not matched",
    description: "Match band: strings that could not be compared with the translation memory",
  },
  previousPeriod: {
    id: "pQRCBKEJtT",
    defaultMessage: "previous {days, plural, one {day} other {# days}}",
    description: "The period a change is compared with: the same number of days just before",
  },
  belowOnePercent: {
    id: "h+xR1ab29F",
    defaultMessage: "under 1%",
    description: "A share above zero but under one percent",
  },
  aboveNinetyNinePercent: {
    id: "VgqRrRxHZ3",
    defaultMessage: "over 99%",
    description: "A share above 99 percent but not complete",
  },
  changeAgainstPrevious: {
    id: "vLHxLYllnD",
    defaultMessage: "{change} vs {previous}",
    description:
      "Change of a number against the previous period: the signed change, then the period it is compared with, such as +12% vs previous 28 days",
  },
  changePoints: {
    id: "CLpCQ8Q6NT",
    defaultMessage: "{change} {count, plural, one {point} other {points}} vs {previous}",
    description:
      "Change of a share in percentage points; change is the signed number, count its size, previous the period compared with",
  },
  noEarlierData: {
    id: "4S+r62936U",
    defaultMessage: "No earlier data",
    description: "Shown instead of a change when the previous period starts before Reports began",
  },
  changeUnavailable: {
    id: "zyXPWyhbra",
    defaultMessage: "No change to show",
    description: "Shown when there is nothing to compare a share with",
  },
  duration: {
    id: "z2YAHDPnDu",
    defaultMessage: "{hours} h {minutes} m",
    description: "A length of time in hours and minutes",
  },
  downloadCsv: {
    id: "nWSKQmdY9E",
    defaultMessage: "Download CSV",
    description: "Button that downloads a table as a CSV file",
  },
  previousPage: {
    id: "T538d2j6a5",
    defaultMessage: "Previous",
    description: "Button that shows the previous page of a table",
  },
  nextPage: {
    id: "Z05+60ddaD",
    defaultMessage: "Next",
    description: "Button that shows the next page of a table",
  },
  showingRows: {
    id: "WGbCyzb3ld",
    defaultMessage: "Showing {from}–{to} of {total}",
    description: "Which rows of a paged table are shown",
  },
  total: {
    id: "QZCevy1gP1",
    defaultMessage: "Total",
    description: "Label of a table's total row",
  },
  noData: {
    id: "eUDoVLjbvv",
    defaultMessage: "Nothing was recorded for these filters.",
    description: "Shown when a report has no rows",
  },
  noDataTitle: {
    id: "BeHj7U26Ab",
    defaultMessage: "No data",
    description: "Title shown when a report has no rows",
  },
  notCounted: {
    id: "bFTfiu1OIR",
    defaultMessage:
      "{count, plural, one {# string} other {# strings}} could not be counted, so they are left out.",
    description: "Note under a table when some strings' words or characters could not be counted",
  },
});
