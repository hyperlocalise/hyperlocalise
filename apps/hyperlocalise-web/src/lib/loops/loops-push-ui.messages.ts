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

export const loopsPushUiMessages = defineMessages({
  pushButton: {
    id: "yPD8+Od4dh",
    defaultMessage: "Push to Loops",
    description: "Button that opens the dialog to write approved email translations to Loops",
  },
  pushQueued: {
    id: "Sz1yzMBXB4",
    defaultMessage: "Loops push queued",
    description: "Toast after a Loops push automation run is queued",
  },
  pushFailed: {
    id: "lT66MLzS6u",
    defaultMessage: "Could not queue Loops push",
    description: "Toast when queuing a Loops push automation run fails",
  },
  selectItemsTitle: {
    id: "ihvxkiqCHV",
    defaultMessage: "Push to Loops",
    description: "Title of the Content editor dialog for choosing Loops emails to push",
  },
  selectItemsDescription: {
    id: "vLVJvfg3Po",
    defaultMessage:
      "Choose which mapped emails to update with approved translations. This creates unpublished locale copies — it never changes the source email.",
    description: "Description of the Loops email picker dialog",
  },
  pushPolicyLabel: {
    id: "Vu4J65KA1/",
    defaultMessage: "Push policy",
    description: "Label for the selected automation Loops overwrite rule",
  },
  pushPolicyOverwrite: {
    id: "9J64wUUz8N",
    defaultMessage: "Overwrite Loops locales when the remote locale is newer.",
    description: "Explains the selected automation overwrites newer Loops locales on push",
  },
  pushPolicyKeepRemote: {
    id: "2Dmlj5N1gP",
    defaultMessage: "Keep Loops locales that teammates edited after the last push.",
    description: "Explains the selected automation keeps newer Loops locales",
  },
  automationLabel: {
    id: "dyX7Y2arV/",
    defaultMessage: "Automation",
    description: "Label for choosing which Loops automation to push with",
  },
  searchItemsPlaceholder: {
    id: "unxdhGd49z",
    defaultMessage: "Search emails",
    description: "Placeholder for filtering mapped Loops emails",
  },
  searchItemsLabel: {
    id: "uM6itDTUoJ",
    defaultMessage: "Search emails",
    description: "Accessible label for the Loops email search field",
  },
  selectAllItems: {
    id: "SfsshI7hWn",
    defaultMessage: "Select all",
    description: "Select every mapped Loops email in the push dialog",
  },
  clearItemSelection: {
    id: "81G0AUQjbU",
    defaultMessage: "Clear",
    description: "Clear the Loops email selection",
  },
  loadingItems: {
    id: "W7F+qO3UhK",
    defaultMessage: "Loading emails",
    description: "Shown while mapped Loops emails load",
  },
  loadItemsError: {
    id: "TBaptqCzza",
    defaultMessage: "Could not load emails",
    description: "Error when mapped Loops emails fail to load",
  },
  noItems: {
    id: "P5XvEFNu8x",
    defaultMessage: "No mapped emails",
    description: "Empty state when a Loops automation has no mapped emails",
  },
  noMatchingItems: {
    id: "RAdEeyvyjj",
    defaultMessage: "No matching emails",
    description: "Empty state when email search matches nothing",
  },
  lastPushFailed: {
    id: "9QlzwaQU4n",
    defaultMessage: "Last push failed",
    description: "Hint that the previous Loops push for this email failed",
  },
  cancelItemSelection: {
    id: "roYIPaQdMy",
    defaultMessage: "Cancel",
    description: "Cancel the Loops email picker",
  },
  pushSelectedItems: {
    id: "1aB1xRtprV",
    defaultMessage: "Push {count, plural, one {# email} other {# emails}}",
    description: "Confirm pushing the selected Loops emails",
  },
  translationsReminder: {
    id: "lRSOKRueqF",
    defaultMessage:
      "Confirm LLM translation is enabled in Loops (Settings → Sending). Copies pushed while it is off land without their language label and show EN.",
    description: "Reminder in the Loops push dialog to enable translations before pushing",
  },
});
