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

export const budgetsTabMessages = defineMessages({
  setBudget: {
    id: "KSOza/lu/U",
    defaultMessage: "Set a budget",
    description: "Button that opens the dialog for setting a project's budget",
  },
  projectColumn: {
    id: "awb3jIA7pt",
    defaultMessage: "Project",
    description: "Column heading: the project",
  },
  budgetColumn: {
    id: "ODLGR9d3/S",
    defaultMessage: "Budget",
    description: "Column heading: the project's budget",
  },
  spentColumn: {
    id: "79o/n4x4B7",
    defaultMessage: "Spent (all time)",
    description: "Column heading: what has been spent",
  },
  toComeColumn: {
    id: "RqR/dOB4Ym",
    defaultMessage: "Still to come",
    description: "Column heading: what unfinished paid work will cost",
  },
  forecastColumn: {
    id: "aIt1FmuvOJ",
    defaultMessage: "Forecast",
    description: "Column heading: spent plus still to come",
  },
  remainingColumn: {
    id: "2dc0ntrChe",
    defaultMessage: "Remaining (before still to come)",
    description: "Column heading: budget minus spent",
  },
  statusColumn: {
    id: "qN/95c8DJx",
    defaultMessage: "Forecast against budget",
    description: "Column heading: how the forecast compares with the budget",
  },
  status_on_track: {
    id: "MNoHFshFuW",
    defaultMessage: "On track",
    description: "Budget status: within budget",
  },
  status_over_80: {
    id: "LGF7eaOQOM",
    defaultMessage: "Over 80%",
    description: "Budget status: more than 80% of the budget is spent",
  },
  status_forecast_over: {
    id: "odj8/u+uCN",
    defaultMessage: "Forecast over",
    description: "Budget status: the forecast is more than the budget",
  },
  status_over_budget: {
    id: "Et/MF505z2",
    defaultMessage: "Over budget",
    description: "Budget status: more than the budget is spent",
  },
  notPriced: {
    id: "6DgBNntVln",
    defaultMessage: "Not priced",
    description: "Still to come cell when unfinished work has no rate at all",
  },
  incomplete: {
    id: "9FyMwA//m0",
    defaultMessage:
      "Some unfinished work has no rate, no time estimate or no match band, so still to come is not exact.",
    description: "Note on a budget whose still to come is incomplete",
  },
  note: {
    id: "zWgBXG1Wl8",
    defaultMessage:
      "Spent includes people's work, billed AI and expenses. Still to come is what unfinished paid work in open tasks will cost.",
    description: "Note under the budgets table",
  },
  tableLabel: {
    id: "5ULYE1CQiU",
    defaultMessage: "Budgets",
    description: "Accessible name of the budgets table",
  },
  noBudgets: {
    id: "HN+oNJx2Mo",
    defaultMessage: "No project has a budget yet.",
    description: "Shown when no project has a budget",
  },
  dialogTitle: {
    id: "HR8aWYGkGj",
    defaultMessage: "Set a budget",
    description: "Title of the set budget dialog",
  },
  dialogDescription: {
    id: "X1J9bDJSAW",
    defaultMessage:
      "A project's budget is one amount for all time. Its rate card prices the project's unfinished work.",
    description: "Description of the set budget dialog",
  },
  project: {
    id: "gYDO1KiuKU",
    defaultMessage: "Project",
    description: "Label of the project field",
  },
  chooseProject: {
    id: "YoNT/y/382",
    defaultMessage: "Choose a project",
    description: "Placeholder of the project field in the set budget dialog",
  },
  amount: {
    id: "wy28ovfnvf",
    defaultMessage: "Budget (USD)",
    description: "Label of the budget amount",
  },
  rateCard: {
    id: "HHF7adln4z",
    defaultMessage: "Rate card",
    description: "Label of the rate card field",
  },
  noRateCard: {
    id: "SxEDSz5VQ5",
    defaultMessage: "No rate card",
    description: "Option for a budget without a rate card",
  },
  cancel: {
    id: "5q+QsCb5GP",
    defaultMessage: "Cancel",
    description: "Button that closes a dialog without saving",
  },
  save: {
    id: "wWqBHmfrNT",
    defaultMessage: "Save budget",
    description: "Button that saves the budget",
  },
  saving: {
    id: "labVcE5WnM",
    defaultMessage: "Saving…",
    description: "Button text while saving",
  },
  loadFailed: {
    id: "T0nIeTVdtm",
    defaultMessage:
      "The budgets could not be loaded, so this cannot be saved. Close and try again.",
    description: "Error in the set budget dialog when the existing budgets fail to load",
  },
  saved: {
    id: "hWXCxydPO+",
    defaultMessage: "Budget saved.",
    description: "Message shown after a budget is saved",
  },
  projectRequired: {
    id: "gwUFWWEPWF",
    defaultMessage: "Choose a project.",
    description: "Error when no project is chosen",
  },
  amountInvalid: {
    id: "Zuqyt5ss4U",
    defaultMessage: "Enter an amount in US dollars, such as 5000.",
    description: "Error when the amount is not valid",
  },
});
