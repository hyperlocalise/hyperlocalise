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

export const costsTabMessages = defineMessages({
  totalSpent: {
    id: "zH6qY7OC7c",
    defaultMessage: "Total spent",
    description: "Costs card: everything spent in the dates",
  },
  people: {
    id: "8LTNP8LHac",
    defaultMessage: "People",
    description: "Costs card and column: people's work",
  },
  peopleDetail: {
    id: "+cUj6cLfrm",
    defaultMessage: "From rate cards and logged time",
    description: "Detail under the people card",
  },
  ai: {
    id: "xYrBUP55ZV",
    defaultMessage: "AI (billed)",
    description: "Costs card and column: AI charged by Hyperlocalise",
  },
  aiDetail: {
    id: "lBFv+UuzDN",
    defaultMessage: "Charged AI calls, on tasks and outside them",
    description: "Detail under the AI card",
  },
  aiOnTasks: {
    id: "FLtvo0/uV8",
    defaultMessage: "AI on tasks",
    description: "Costs column: AI charged on tasks",
  },
  aiOutsideTasks: {
    id: "xlxoUp+bTs",
    defaultMessage: "AI outside tasks",
    description: "Costs column: AI charged with no task, such as content editor suggestions",
  },
  outsideProjects: {
    id: "+HCaUIpawr",
    defaultMessage: "Outside any project",
    description: "Costs row: AI charged with no project, such as chat with no project",
  },
  expenses: {
    id: "E3a9TrP1uE",
    defaultMessage: "Expenses",
    description: "Costs card and column: expenses added by hand",
  },
  expensesDetail: {
    id: "tAT7VJda/C",
    defaultMessage: "Added by hand",
    description: "Detail under the expenses card",
  },
  projectColumn: {
    id: "awb3jIA7pt",
    defaultMessage: "Project",
    description: "Column heading: the project",
  },
  totalColumn: {
    id: "xkvxbuC9Tn",
    defaultMessage: "Total",
    description: "Column heading: a project's total",
  },
  tableLabel: {
    id: "HGhsIR52do",
    defaultMessage: "Costs by project",
    description: "Accessible name of the costs table",
  },
  addExpense: {
    id: "8cjn2GRSSJ",
    defaultMessage: "Add expense",
    description: "Button that opens the dialog for adding an expense",
  },
  unpriced: {
    id: "Whb95x0t2T",
    defaultMessage:
      "{count, plural, one {# piece of people's work has no rate, so it is left out.} other {# pieces of people's work have no rate, so they are left out.}}",
    description: "Note when some people's work had no rate",
  },
  pendingAi: {
    id: "aNOwfGGShe",
    defaultMessage:
      "{count, plural, one {# AI charge is} other {# AI charges are}} still waiting for billing, so AI spending may rise.",
    description: "Note when some AI charges are not yet known",
  },
  aiByLanguage: {
    id: "drH1gS+t4P",
    defaultMessage:
      "AI charges are not split by language, so they are left out while a language is chosen.",
    description: "Note when costs are filtered by language",
  },
  noCosts: {
    id: "1qUA3TQ2aW",
    defaultMessage: "Nothing was spent in these dates.",
    description: "Shown when there are no costs",
  },
  expenseTitle: {
    id: "0LdJqJSAJW",
    defaultMessage: "Add expense",
    description: "Title of the add expense dialog",
  },
  expenseDescription: {
    id: "pyjtKMfIIw",
    defaultMessage: "Record a cost that Reports cannot see, such as an agency invoice.",
    description: "Description of the add expense dialog",
  },
  amount: {
    id: "laNmUs0rc+",
    defaultMessage: "Amount (USD)",
    description: "Label of the expense amount",
  },
  note: {
    id: "pbf/8ZXD0X",
    defaultMessage: "What it was for",
    description: "Label of the expense note",
  },
  chooseProject: {
    id: "G3ZipyCtAH",
    defaultMessage: "Choose a project",
    description: "Placeholder of the project field",
  },
  cancel: {
    id: "5q+QsCb5GP",
    defaultMessage: "Cancel",
    description: "Button that closes a dialog without saving",
  },
  save: {
    id: "v/iqKXawFI",
    defaultMessage: "Add expense",
    description: "Button that saves the expense",
  },
  saving: {
    id: "labVcE5WnM",
    defaultMessage: "Saving…",
    description: "Button text while saving",
  },
  saved: {
    id: "q+IrtJFU3l",
    defaultMessage: "Expense added.",
    description: "Message shown after an expense is added",
  },
  projectRequired: {
    id: "gwUFWWEPWF",
    defaultMessage: "Choose a project.",
    description: "Error when no project is chosen",
  },
  amountInvalid: {
    id: "ahKQ/Hvzg2",
    defaultMessage: "Enter an amount in US dollars, such as 120.50.",
    description: "Error when the amount is not valid",
  },
  noteRequired: {
    id: "iEUqa4wC3Y",
    defaultMessage: "Say what the expense was for.",
    description: "Error when the note is empty",
  },
});
