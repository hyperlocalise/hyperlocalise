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

export const costEstimateTabMessages = defineMessages({
  chooseTasksTitle: {
    id: "trS29lmrge",
    defaultMessage: "Choose tasks to estimate",
    description: "Shown on the cost estimate tab before any task is chosen",
  },
  chooseTasksDescription: {
    id: "zdt5t48/02",
    defaultMessage:
      "Pick up to 50 tasks above, or choose one project to estimate all of it. The estimate covers every word, finished or not.",
    description: "Explains how to start a cost estimate",
  },
  wholeProjectNote: {
    id: "5CA5krT8sM",
    defaultMessage:
      "The whole project: every string it holds now, in a task or not, priced by the project budget's rate card or the one chosen here. Pick tasks to price them by their own cards.",
    description: "Line above a cost estimate of a whole project rather than chosen tasks",
  },
  unitsToTranslate: {
    id: "IBAwfyPf94",
    defaultMessage: "{unit} to translate",
    description: "Estimate card: the units of the chosen tasks, such as Words to translate",
  },
  wholeProjectCount: {
    id: "d5JCHvYpif",
    defaultMessage: "The whole project",
    description:
      "In place of the task count under the units card when a whole project is estimated",
  },
  tasksCount: {
    id: "GZKnztd4Eu",
    defaultMessage: "{count, plural, one {# task} other {# tasks}}",
    description: "How many tasks an estimate covers",
  },
  languagesCount: {
    id: "eYGVX6Qlp+",
    defaultMessage: "{count, plural, one {# language} other {# languages}}",
    description: "How many languages an estimate covers",
  },
  unitsDetail: {
    id: "a7g4EIMlNZ",
    defaultMessage: "{tasks}, {languages}, finished or not",
    description:
      "Detail under the units card: the counts of tasks and of languages, already worded",
  },
  weighted: {
    id: "twzYauR4y5",
    defaultMessage: "Weighted {basis}",
    description: "Estimate card: units after match discounts, such as Weighted words",
  },
  weightedDetail: {
    id: "deyV6eZ1HA",
    defaultMessage: "After the rate card's match discounts",
    description: "Detail under the weighted units card",
  },
  estimatedCost: {
    id: "R9KGmh3yua",
    defaultMessage: "Estimated cost",
    description: "Estimate card: what the chosen tasks will cost",
  },
  estimatedCostDetail: {
    id: "vDhrUq0hWX",
    defaultMessage: "{card} · translation and review",
    description: "Detail under the estimated cost card: the rate card used",
  },
  estimatedCostCards: {
    id: "rRNJYrXxd5",
    defaultMessage:
      "{count, plural, one {# rate card} other {# rate cards}} · translation and review",
    description:
      "Detail under the estimated cost card when rows are priced by more than one rate card",
  },
  estimatedCostNoCard: {
    id: "Hn0nYW2Eoc",
    defaultMessage: "Task and budget rates · translation and review",
    description: "Detail under the estimated cost card when no rate card is chosen",
  },
  incomplete: {
    id: "/XGJylRSFv",
    defaultMessage:
      "Some work has no rate, no time estimate or no match band, so the cost is not exact.",
    description: "Warning when an estimate is missing some prices",
  },
  memorySavings: {
    id: "IpZ9FS/utY",
    defaultMessage: "Saved by the memory",
    description: "Estimate card: share saved by translation memory matches",
  },
  memorySavingsDetail: {
    id: "omiOFhhyA0",
    defaultMessage: "Against paying every match band in full",
    description: "Detail under the memory savings card",
  },
  languageColumn: {
    id: "wNTnMH8vtk",
    defaultMessage: "Language",
    description: "Column heading: the target language",
  },
  stepColumn: {
    id: "G483RkGMWe",
    defaultMessage: "Step",
    description: "Column heading: the step",
  },
  weightedColumn: {
    id: "DyWBONsPlm",
    defaultMessage: "Weighted",
    description: "Column heading: units after match discounts",
  },
  rateColumn: {
    id: "524y5wtSzd",
    defaultMessage: "Rate",
    description: "Column heading: the rate that prices the row",
  },
  costColumn: {
    id: "l5Ho8senmU",
    defaultMessage: "Cost",
    description: "Column heading: the row's cost",
  },
  paidAt: {
    id: "KAZ6Dk0/c8",
    defaultMessage: "Paid at",
    description: "Row of the estimate table: the share of each match band the rate card pays",
  },
  perBasis_word: {
    id: "dkIu1uII2Q",
    defaultMessage: "{rate} / word",
    description: "A rate charged per word",
  },
  perBasis_character: {
    id: "12tUFj7BbU",
    defaultMessage: "{rate} / character",
    description: "A rate charged per character without spaces",
  },
  perBasis_character_with_spaces: {
    id: "bqwyHljaun",
    defaultMessage: "{rate} / character with spaces",
    description: "A rate charged per character including spaces",
  },
  perBasis_hour: {
    id: "soYVsa2P7b",
    defaultMessage: "{rate} / hour",
    description: "A rate charged per hour",
  },
  basis_word: {
    id: "tKdwJD/VUy",
    defaultMessage: "words",
    description: "Plural noun for the weighted card: words",
  },
  basis_character: {
    id: "U7L1HEq5cv",
    defaultMessage: "characters",
    description: "Plural noun for the weighted card: characters",
  },
  basis_character_with_spaces: {
    id: "K/S7PHOorw",
    defaultMessage: "characters with spaces",
    description: "Plural noun for the weighted card: characters with spaces",
  },
  basis_hour: {
    id: "frS78SpwNG",
    defaultMessage: "hours",
    description: "Plural noun: hours",
  },
  noRate: {
    id: "xC5/Uw5o1W",
    defaultMessage: "No rate",
    description: "Shown instead of a rate when the language has none on the rate card",
  },
  fixedFee: {
    id: "LN9F71LX3/",
    defaultMessage: "Fixed fee",
    description: "Shown instead of a rate when the task has a fixed price",
  },
  noEstimate: {
    id: "cUjIt05HlY",
    defaultMessage: "No time estimate",
    description: "Shown when an hourly line's task has no time estimate",
  },
  noRateNote: {
    id: "gDpBbPZdyc",
    defaultMessage:
      "{languages} {count, plural, one {has} other {have}} no rate on {card}, so weighted units and cost are left blank rather than guessed.",
    description:
      "Note under the estimate when some languages have no rate on the card that prices them; card is the rate card's name",
  },
  noCardNote: {
    id: "a1lOL9DMxB",
    defaultMessage:
      "{count, plural, one {{languages} has no rate card, because the workspace has none yet. Add one under Manage rates to price it.} other {{languages} have no rate card, because the workspace has none yet. Add one under Manage rates to price them.}}",
    description:
      "Note under the estimate when the workspace has no rate card at all; Manage rates is the button that opens the rate cards",
  },
  pricedByColumn: {
    id: "01Xqzlo6od",
    defaultMessage: "Rate card",
    description:
      "Column heading: the rate card that prices the row, or that has no rate for it, and why that card",
  },
  pricedByCell: {
    id: "A122otHF9H",
    defaultMessage: "{card} · {sources}",
    description:
      "Rate card cell: a rate card's name, then why that card applies to the row, such as Agency B · budget",
  },
  pricedBy_task: {
    id: "clvzZNjf5F",
    defaultMessage: "task",
    description: "Why a card applies to a row: it is the task's own rate card",
  },
  pricedBy_budget: {
    id: "ERxDR4qEWS",
    defaultMessage: "budget",
    description: "Why a card applies to a row: it is the rate card of the project's budget",
  },
  pricedBy_chosen: {
    id: "6lltmCDZue",
    defaultMessage: "chosen here",
    description: "Why a card applies to a row: it is the rate card chosen on this page",
  },
  noRateCard: {
    id: "oQKRdWs09R",
    defaultMessage: "No rate card",
    description: "Rate card cell when no rate card applies to the row",
  },
  fixedFees: {
    id: "uCFqHd7i8y",
    defaultMessage: "Fixed fees",
    description: "Heading of the list of tasks priced at a fixed fee",
  },
  fixedFeesLeftOut: {
    id: "EBmQpNhtBF",
    defaultMessage:
      "{count, plural, one {# fixed fee belongs to a whole task, not a language, so it is left out while a language is chosen.} other {# fixed fees belong to whole tasks, not languages, so they are left out while a language is chosen.}}",
    description: "Note when fixed fees are left out under a language filter",
  },
  unestimatedNote: {
    id: "9OTiPECmGp",
    defaultMessage: "Hourly work on a task with no time estimate is left out of the cost.",
    description: "Note when an hourly line has no time estimate",
  },
  pricingOrder: {
    id: "4yXMx8Oi07",
    defaultMessage:
      "A task's own rate card comes first, then its project budget's rate card, then the one chosen here. The first card found prices every language.",
    description: "Note on which rate prices each task",
  },
  uncountedNote: {
    id: "O485JMLkNO",
    defaultMessage:
      "{count, plural, one {# string could not be counted, so it is priced at nothing.} other {# strings could not be counted, so they are priced at nothing.}}",
    description:
      "Note under the estimate when some strings' words or characters could not be counted",
  },
  tableLabel: {
    id: "YbphJVYBTz",
    defaultMessage: "Cost estimate",
    description: "Accessible name of the estimate table",
  },
});
