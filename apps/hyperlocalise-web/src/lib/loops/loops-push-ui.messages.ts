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
    id: "loopsPushUi.pushButton",
    defaultMessage: "Push to Loops",
    description: "Button that opens the dialog to write approved email translations to Loops",
  },
  pushQueued: {
    id: "loopsPushUi.pushQueued",
    defaultMessage: "Loops push queued",
    description: "Toast after a Loops push automation run is queued",
  },
  pushFailed: {
    id: "loopsPushUi.pushFailed",
    defaultMessage: "Could not queue Loops push",
    description: "Toast when queuing a Loops push automation run fails",
  },
  selectItemsTitle: {
    id: "loopsPushUi.selectItemsTitle",
    defaultMessage: "Push to Loops",
    description: "Title of the Content editor dialog for choosing Loops emails to push",
  },
  selectItemsDescription: {
    id: "loopsPushUi.selectItemsDescription",
    defaultMessage:
      "Choose which mapped emails to update with approved translations. This creates unpublished locale copies — it never changes the source email.",
    description: "Description of the Loops email picker dialog",
  },
  pushPolicyLabel: {
    id: "loopsPushUi.pushPolicyLabel",
    defaultMessage: "Push policy",
    description: "Label for the selected automation Loops overwrite rule",
  },
  pushPolicyOverwrite: {
    id: "loopsPushUi.pushPolicyOverwrite",
    defaultMessage: "Overwrite Loops locales when the remote locale is newer.",
    description: "Explains the selected automation overwrites newer Loops locales on push",
  },
  pushPolicyKeepRemote: {
    id: "loopsPushUi.pushPolicyKeepRemote",
    defaultMessage: "Keep Loops locales that teammates edited after the last push.",
    description: "Explains the selected automation keeps newer Loops locales",
  },
  automationLabel: {
    id: "loopsPushUi.automationLabel",
    defaultMessage: "Automation",
    description: "Label for choosing which Loops automation to push with",
  },
  searchItemsPlaceholder: {
    id: "loopsPushUi.searchItemsPlaceholder",
    defaultMessage: "Search emails",
    description: "Placeholder for filtering mapped Loops emails",
  },
  searchItemsLabel: {
    id: "loopsPushUi.searchItemsLabel",
    defaultMessage: "Search emails",
    description: "Accessible label for the Loops email search field",
  },
  selectAllItems: {
    id: "loopsPushUi.selectAllItems",
    defaultMessage: "Select all",
    description: "Select every mapped Loops email in the push dialog",
  },
  clearItemSelection: {
    id: "loopsPushUi.clearItemSelection",
    defaultMessage: "Clear",
    description: "Clear the Loops email selection",
  },
  loadingItems: {
    id: "loopsPushUi.loadingItems",
    defaultMessage: "Loading emails",
    description: "Shown while mapped Loops emails load",
  },
  loadItemsError: {
    id: "loopsPushUi.loadItemsError",
    defaultMessage: "Could not load emails",
    description: "Error when mapped Loops emails fail to load",
  },
  noItems: {
    id: "loopsPushUi.noItems",
    defaultMessage: "No mapped emails",
    description: "Empty state when a Loops automation has no mapped emails",
  },
  noMatchingItems: {
    id: "loopsPushUi.noMatchingItems",
    defaultMessage: "No matching emails",
    description: "Empty state when email search matches nothing",
  },
  lastPushFailed: {
    id: "loopsPushUi.lastPushFailed",
    defaultMessage: "Last push failed",
    description: "Hint that the previous Loops push for this email failed",
  },
  cancelItemSelection: {
    id: "loopsPushUi.cancelItemSelection",
    defaultMessage: "Cancel",
    description: "Cancel the Loops email picker",
  },
  pushSelectedItems: {
    id: "loopsPushUi.pushSelectedItems",
    defaultMessage: "Push {count, plural, one {# email} other {# emails}}",
    description: "Confirm pushing the selected Loops emails",
  },
});
