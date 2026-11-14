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

export const quoteDialogMessages = defineMessages({
  openQuote: {
    id: "6q041SWXrc",
    defaultMessage: "Create quote",
    description: "Button on the Cost estimate tab that opens the quote dialog",
  },
  title: {
    id: "Xj/aHe1rki",
    defaultMessage: "Create a quote",
    description: "Title of the dialog that turns a cost estimate into a quote",
  },
  description: {
    id: "b8AXM1khOE",
    defaultMessage:
      "The quote lists this estimate by language and step, with each rate and amount. Nothing is saved.",
    description: "Explanation in the quote dialog",
  },
  client: {
    id: "NRi3A4qimB",
    defaultMessage: "Client",
    description: "Label of the field for who the quote is for",
  },
  reference: {
    id: "2bKPj5jMhl",
    defaultMessage: "Reference",
    description: "Label of the field for the quote's reference, such as a purchase order number",
  },
  validDays: {
    id: "+Wpv0T3a6q",
    defaultMessage: "Valid for (days)",
    description: "Label of the field for how many days the quote is valid",
  },
  validDaysInvalid: {
    id: "SuDwqk2F0V",
    defaultMessage: "Enter a whole number of days from 1 to 365.",
    description: "Error when the quote's validity is not 1 to 365 days",
  },
  downloadExcel: {
    id: "69KFzmG1Jw",
    defaultMessage: "Download Excel",
    description: "Button that downloads the quote as an Excel workbook",
  },
  printPdf: {
    id: "6LfInx/qYv",
    defaultMessage: "Print or save as PDF",
    description: "Button that opens the quote for printing or saving as a PDF",
  },
  printBlocked: {
    id: "UnFA9Bhy2I",
    defaultMessage: "Allow pop-ups for this site to print the quote.",
    description: "Error when the browser blocked the window the quote prints from",
  },
  cancel: {
    id: "AiIn5ZbV8s",
    defaultMessage: "Cancel",
    description: "Button that closes the quote dialog",
  },
  quoteHeading: {
    id: "ADCACm3JCm",
    defaultMessage: "Quote",
    description: "Heading of the printed quote",
  },
  forLabel: {
    id: "GNRst3mkEp",
    defaultMessage: "For",
    description: "Printed quote: label before the client's name",
  },
  referenceLabel: {
    id: "HbgaiK6lwD",
    defaultMessage: "Reference",
    description: "Printed quote: label before the reference",
  },
  dateLabel: {
    id: "NEQy77Ea4m",
    defaultMessage: "Date",
    description: "Printed quote: label before the day it was made",
  },
  validUntilLabel: {
    id: "JJyz0weOSs",
    defaultMessage: "Valid until",
    description: "Printed quote: label before the last day it is valid",
  },
  languageColumn: {
    id: "9kMg9gI45r",
    defaultMessage: "Language",
    description: "Printed quote column: the target language",
  },
  stepColumn: {
    id: "YvGh+XqY1O",
    defaultMessage: "Step",
    description: "Printed quote column: translation or review",
  },
  unitsColumn: {
    id: "f2kRPbwlhl",
    defaultMessage: "Units",
    description: "Printed quote column: how many units the line covers",
  },
  rateColumn: {
    id: "XX/HpfGaN5",
    defaultMessage: "Rate",
    description: "Printed quote column: the rate per unit",
  },
  amountColumn: {
    id: "eY5sPJ6yIZ",
    defaultMessage: "Amount",
    description: "Printed quote column: what the line costs",
  },
  fixedFee: {
    id: "louTermQ9O",
    defaultMessage: "Fixed fee: {task}",
    description: "Printed quote line for a task's fixed fee",
  },
  total: {
    id: "f5pHV2eXjV",
    defaultMessage: "Total",
    description: "Printed quote: the total amount",
  },
  notExact: {
    id: "0WiFuXZGAa",
    defaultMessage:
      "Some work has no rate, time estimate or match band, so this total is not exact.",
    description: "Printed quote note when the estimate is incomplete",
  },
  noRate: {
    id: "0xSyRfkQnM",
    defaultMessage: "No rate",
    description: "Printed quote: shown instead of a rate when the language has none",
  },
  unpricedNote: {
    id: "1aQmXb3e8l",
    defaultMessage: "{count} units have no rate and are not in the total.",
    description: "Printed quote note when some units have no rate",
  },
  unavailableNote: {
    id: "zK8wdNY9ug",
    defaultMessage:
      "{count} units could not be matched against translation memory and are priced as new work.",
    description: "Printed quote note when some units had no memory match",
  },
  unestimatedNote: {
    id: "MTdu3wkxG7",
    defaultMessage: "Some hourly work has no time estimate and is not in the total.",
    description: "Printed quote note when an hourly line has no time estimate",
  },
  postEditNote: {
    id: "+mf+eK5IV5",
    defaultMessage:
      "Lines set to post-edit pricing are estimated from memory match; pay is by how much the text changes.",
    description: "Printed quote note when a rate line pays by post-edit band",
  },
});
