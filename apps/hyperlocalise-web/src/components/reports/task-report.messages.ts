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

export const taskReportMessages = defineMessages({
  intro: {
    id: "/ZTRO0/2FX",
    defaultMessage: "This whole task, whatever its dates. Days use UTC.",
    description: "Line at the top of a task's Report tab",
  },
  openInReports: {
    id: "9ZWYVTYF71",
    defaultMessage: "Open in Reports",
    description: "Link from a task's Report tab to the project's Reports page",
  },
  unitsToTranslate: {
    id: "6pyhkYjHro",
    defaultMessage: "{unit} to translate",
    description:
      "Task report card: the task's units in the chosen step, such as Words to translate",
  },
  unitsDetail: {
    id: "XfEzga7XIQ",
    defaultMessage: "{source} unique · {languages}",
    description:
      "Detail under the units card: how many of the units are unique source text, then how many languages, already worded",
  },
  languagesCount: {
    id: "7b3bUzw34w",
    defaultMessage: "{count, plural, one {# language} other {# languages}}",
    description: "How many languages a task goes into",
  },
  finished: {
    id: "TL04QkH28w",
    defaultMessage: "Finished",
    description: "Task report card: the task's units finished in the chosen step",
  },
  finishedDetail: {
    id: "Lt16Kw/AJE",
    defaultMessage: "{step} step",
    description: "Detail under the finished card: the step, such as Translation step",
  },
  progress: {
    id: "tMUuz8k4Pc",
    defaultMessage: "Progress",
    description: "Task report card: the share of the task's units finished in the chosen step",
  },
  progressDetail: {
    id: "/QQ5IDxhHM",
    defaultMessage: "Of this task's work in the step",
    description: "Detail under the progress card",
  },
  approved: {
    id: "8M2cZz0BGF",
    defaultMessage: "Approved",
    description: "Task report card: the share of the task's translated units that were reviewed",
  },
  approvedDetail: {
    id: "1AD7GTm5qZ",
    defaultMessage: "Of what was translated",
    description: "Detail under the approved card",
  },
  estimatedCost: {
    id: "pcsA03IbFY",
    defaultMessage: "Estimated cost",
    description: "Task report card: what the task costs, finished or not",
  },
  stillToCome: {
    id: "xxQx2WVSK6",
    defaultMessage: "{amount} still to come",
    description: "Detail under the estimated cost card: what the unfinished work will still cost",
  },
  incomplete: {
    id: "CTYBUBZ8WJ",
    defaultMessage: "Some work has no rate or no time estimate, so the cost is too low.",
    description: "Detail under the estimated cost card when some prices are missing",
  },
  matchAnalysis: {
    id: "bFTGBp2Z2N",
    defaultMessage: "Match analysis",
    description: "Title of the task's table of units by match band",
  },
  matchAnalysisDetail: {
    id: "HYnuNjkGYZ",
    defaultMessage: "Bands show how much the translation memory covered when the work arrived.",
    description: "Subtitle of the task's match analysis table",
  },
  tableLabel: {
    id: "oMl/P0Q7Cn",
    defaultMessage: "Task match analysis",
    description: "Accessible name of the task's match analysis table",
  },
  stepSwitch: {
    id: "z5AXV2MPvj",
    defaultMessage: "Step",
    description: "Accessible name of the switch between the translation and review steps",
  },
  languageColumn: {
    id: "wNTnMH8vtk",
    defaultMessage: "Language",
    description: "Column heading: the target language",
  },
  totalColumn: {
    id: "M3xdpXieqW",
    defaultMessage: "Total",
    description: "Column heading: all of a language's units",
  },
  finishedColumn: {
    id: "5AnbFvcAwF",
    defaultMessage: "Finished",
    description: "Column heading: a language's finished units",
  },
  weightedColumn: {
    id: "rgJhnMN/fW",
    defaultMessage: "Weighted",
    description: "Column heading: units after the rate card's match discounts",
  },
  costColumn: {
    id: "S8iM/+Di8W",
    defaultMessage: "Cost",
    description: "Column heading: what a language costs",
  },
  noWords: {
    id: "MvmRtuuYu/",
    defaultMessage: "Reports has nothing for this step of the task yet.",
    description: "Shown when the task has no units in the chosen step",
  },
  timeLogged: {
    id: "G8T1FYb+cF",
    defaultMessage: "Time logged",
    description: "Title of the task's logged time",
  },
  timeSummary: {
    id: "okaDHZhLas",
    defaultMessage: "{duration} by {people}",
    description:
      "Subtitle of the task's logged time: the total, then how many people, already worded",
  },
  peopleCount: {
    id: "PatbUgdWQn",
    defaultMessage: "{count, plural, one {# person} other {# people}}",
    description: "How many people logged time",
  },
  ownTimeOnly: {
    id: "+YIs+b4kQq",
    defaultMessage: "Only your own entries are listed.",
    description: "Note under the time table for roles that see only their own time",
  },
  logTime: {
    id: "U6kaIagNF5",
    defaultMessage: "Log time",
    description: "Button that opens the dialog for logging time on the task",
  },
  timeLabel: {
    id: "MDlLc8yxwW",
    defaultMessage: "Time logged on this task",
    description: "Accessible name of the task's time table",
  },
  dayColumn: {
    id: "wbsC74Hb0J",
    defaultMessage: "Day",
    description: "Column heading: the day the time was spent",
  },
  personColumn: {
    id: "kRTpEdy6V8",
    defaultMessage: "Person",
    description: "Column heading: who logged the time",
  },
  stepColumn: {
    id: "G483RkGMWe",
    defaultMessage: "Step",
    description: "Column heading: the step",
  },
  timeColumn: {
    id: "2oznX2lci4",
    defaultMessage: "Time",
    description: "Column heading: the time spent",
  },
  noteColumn: {
    id: "BB3vZ37Hlg",
    defaultMessage: "Note",
    description: "Column heading: the note on a time entry",
  },
  actionsColumn: {
    id: "vb1o8usNaW",
    defaultMessage: "Actions",
    description: "Column heading, read by screen readers only: the buttons for a row",
  },
  edit: {
    id: "uPw9H782Mo",
    defaultMessage: "Edit",
    description: "Button that opens a dialog to change a row",
  },
  editTimeLabel: {
    id: "L7mkKGAfM9",
    defaultMessage: "Edit time logged on {day}",
    description: "Accessible name of the edit button for a time entry",
  },
  noTime: {
    id: "iM52fc7v5d",
    defaultMessage: "No time logged on this task yet.",
    description: "Shown when the task has no time entries",
  },
  pricing: {
    id: "MjtckoPZCo",
    defaultMessage: "Task pricing",
    description: "Title of the task's own rate card, time estimate and fixed fee for each step",
  },
  pricingDetail: {
    id: "zRtUSUXrCq",
    defaultMessage:
      "This task's own rate card, time estimate or fixed fee. A step without a card of its own is priced by its project budget's card. Each step's pricing can change until work on it starts.",
    description: "Subtitle of the task pricing section",
  },
  pricingLabel: {
    id: "JyAN3jZyUj",
    defaultMessage: "Task pricing by step",
    description: "Accessible name of the task pricing table",
  },
  rateCardColumn: {
    id: "mfAngcgq0w",
    defaultMessage: "Rate card",
    description: "Column heading: the task's own rate card for the step",
  },
  estimateColumn: {
    id: "i4A8tgsl1c",
    defaultMessage: "Time estimate",
    description: "Column heading: how long the step is expected to take",
  },
  feeColumn: {
    id: "YFD3L1P1B+",
    defaultMessage: "Fixed fee",
    description: "Column heading: a fixed price for the step, instead of rates",
  },
  pricedCard: {
    id: "9LhH/qmimS",
    defaultMessage: "{card} · prices of {date}",
    description: "Rate card cell: the card's name, then the day its prices were taken",
  },
  none: {
    id: "MYndkwv0uy",
    defaultMessage: "None",
    description: "Shown when the task has no rate card, time estimate or fee of its own",
  },
  locked: {
    id: "RASl2I0Pxg",
    defaultMessage: "Work started",
    description: "Shown instead of the edit button when a step's pricing can no longer change",
  },
  setPricing: {
    id: "XvBjQyJqqk",
    defaultMessage: "Set pricing",
    description: "Button that opens the dialog for a step's pricing",
  },
  setPricingLabel: {
    id: "vTHCl13pkg",
    defaultMessage: "Set pricing for the {step} step",
    description: "Accessible name of the set pricing button for one step",
  },
  pricingTitle: {
    id: "9jFpUvfD8P",
    defaultMessage: "Pricing for the {step} step",
    description: "Title of the task pricing dialog",
  },
  pricingDescription: {
    id: "ff3jae0jNL",
    defaultMessage:
      "Each language is priced by the card's rate for it, as the card is now. Later changes to the card leave this task's prices as they are.",
    description: "Description of the task pricing dialog",
  },
  rateCardField: {
    id: "T/m7uQWvYV",
    defaultMessage: "Rate card",
    description: "Label of the task's rate card field",
  },
  noCard: {
    id: "NArjGoa2gi",
    defaultMessage: "None: the project budget's card",
    description: "Rate card option: the task has no card of its own",
  },
  estimateField: {
    id: "4Z4Ev0xSwu",
    defaultMessage: "Time estimate (minutes)",
    description: "Label of the task's time estimate field",
  },
  feeField: {
    id: "/vkBLbtzp+",
    defaultMessage: "Fixed fee (USD)",
    description: "Label of the task's fixed fee field",
  },
  minutesInvalid: {
    id: "0kVq+Iz5xk",
    defaultMessage: "Enter whole minutes, such as 90.",
    description: "Error when the time estimate is not a whole number of minutes",
  },
  feeInvalid: {
    id: "MV67KSe34a",
    defaultMessage: "Enter an amount in US dollars, such as 250.",
    description: "Error when the fixed fee is not an amount",
  },
  pricingLocked: {
    id: "tRCaFPjZFW",
    defaultMessage: "Work on this step has started, so its pricing can no longer change.",
    description: "Error when a step's pricing is saved after work on it started",
  },
  cancel: {
    id: "5q+QsCb5GP",
    defaultMessage: "Cancel",
    description: "Button that closes a dialog without saving",
  },
  savePricing: {
    id: "3vjWR/XxKD",
    defaultMessage: "Save pricing",
    description: "Button that saves a step's pricing",
  },
  saving: {
    id: "labVcE5WnM",
    defaultMessage: "Saving…",
    description: "Button text while saving",
  },
  pricingSaved: {
    id: "QXD+22ZDb1",
    defaultMessage: "Pricing saved.",
    description: "Message shown after a step's pricing is saved",
  },
  editTimeTitle: {
    id: "t4eO7Nji1M",
    defaultMessage: "Edit time",
    description: "Title of the dialog for changing a time entry",
  },
  editTimeDescription: {
    id: "CgZg6J6M/Y",
    defaultMessage: "Change the day, time or note, or delete the entry.",
    description: "Description of the dialog for changing a time entry",
  },
  deleteTime: {
    id: "gmbZIhCfIu",
    defaultMessage: "Delete entry",
    description: "Button that deletes a time entry",
  },
  deleting: {
    id: "VwnA8TKnsb",
    defaultMessage: "Deleting…",
    description: "Button text while a time entry is deleted",
  },
  saveTime: {
    id: "i4rxR8ZBA6",
    defaultMessage: "Save",
    description: "Button that saves a changed time entry",
  },
  timeSaved: {
    id: "CikP+wjwXP",
    defaultMessage: "Time entry saved.",
    description: "Message shown after a time entry is changed",
  },
  timeDeleted: {
    id: "+kvZ9NRM24",
    defaultMessage: "Time entry deleted.",
    description: "Message shown after a time entry is deleted",
  },
});
