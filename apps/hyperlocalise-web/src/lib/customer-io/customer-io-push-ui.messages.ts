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

export const customerIoPushUiMessages = defineMessages({
  pushButton: {
    id: "UcFNsQbu4I",
    defaultMessage: "Push to Customer.io",
    description:
      "Button that opens the dialog to write approved message translations to Customer.io",
  },
  pushQueued: {
    id: "uBFnquvWXR",
    defaultMessage: "Customer.io push queued",
    description: "Toast after a Customer.io push automation run is queued",
  },
  pushFailed: {
    id: "iggux3qGee",
    defaultMessage: "Could not queue Customer.io push",
    description: "Toast when queuing a Customer.io push automation run fails",
  },
  selectItemsTitle: {
    id: "OF4drUQGOe",
    defaultMessage: "Push to Customer.io",
    description: "Title of the Content editor dialog for choosing Customer.io messages to push",
  },
  selectItemsDescription: {
    id: "5xBWJwpAdM",
    defaultMessage:
      "Choose which mapped messages to update with approved translations. This only writes content — it never sends.",
    description: "Description of the Customer.io message picker dialog",
  },
  pushPolicyLabel: {
    id: "fRRpr4ssH/",
    defaultMessage: "Push policy",
    description: "Label for the selected automation Customer.io overwrite rule",
  },
  pushPolicyOverwrite: {
    id: "ZAH2OIgqxD",
    defaultMessage: "Overwrite Customer.io locales when the remote locale is newer.",
    description: "Explains the selected automation overwrites newer Customer.io locales on push",
  },
  pushPolicyKeepRemote: {
    id: "cXxIDbMkgJ",
    defaultMessage: "Keep Customer.io locales that teammates edited after the last push.",
    description: "Explains the selected automation keeps newer Customer.io locales",
  },
  automationLabel: {
    id: "Zqf++rV/7O",
    defaultMessage: "Automation",
    description: "Label for choosing which Customer.io automation to push with",
  },
  searchItemsPlaceholder: {
    id: "AHSytQUJk6",
    defaultMessage: "Search messages",
    description: "Placeholder for filtering mapped Customer.io messages",
  },
  searchItemsLabel: {
    id: "Ea8ZaaJ1HR",
    defaultMessage: "Search messages",
    description: "Accessible label for the Customer.io message search field",
  },
  selectAllItems: {
    id: "nP5/XmJ2o7",
    defaultMessage: "Select all",
    description: "Select every mapped Customer.io message in the push dialog",
  },
  clearItemSelection: {
    id: "jE6/WhmKkH",
    defaultMessage: "Clear",
    description: "Clear the Customer.io message selection",
  },
  loadingItems: {
    id: "oCa8hcO5ye",
    defaultMessage: "Loading messages",
    description: "Shown while mapped Customer.io messages load",
  },
  loadItemsError: {
    id: "k9j7R6aLei",
    defaultMessage: "Could not load messages",
    description: "Error when mapped Customer.io messages fail to load",
  },
  noItems: {
    id: "bLPlFAaHJw",
    defaultMessage: "No mapped messages",
    description: "Empty state when a Customer.io automation has no mapped messages",
  },
  noMatchingItems: {
    id: "Celg5IKRG3",
    defaultMessage: "No matching messages",
    description: "Empty state when message search matches nothing",
  },
  lastPushFailed: {
    id: "1aTRVgALBt",
    defaultMessage: "Last push failed",
    description: "Hint that the previous Customer.io push for this message failed",
  },
  cancelItemSelection: {
    id: "T+VDvnW8FQ",
    defaultMessage: "Cancel",
    description: "Cancel the Customer.io message picker",
  },
  pushSelectedItems: {
    id: "NPbgrkRohR",
    defaultMessage: "Push {count, plural, one {# message} other {# messages}}",
    description: "Confirm pushing the selected Customer.io messages",
  },
});
