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

export const iterablePushUiMessages = defineMessages({
  pushButton: {
    id: "/FSlgf2vD0",
    defaultMessage: "Push to Iterable",
    description: "Button that opens the dialog to write approved templates to Iterable",
  },
  pushQueued: {
    id: "5G+03OcnR5",
    defaultMessage: "Iterable push queued",
    description: "Toast after an Iterable push automation run is queued",
  },
  pushFailed: {
    id: "old2jVGL0x",
    defaultMessage: "Could not queue Iterable push",
    description: "Toast when queuing an Iterable push automation run fails",
  },
  selectItemsTitle: {
    id: "yaIbNX73Wb",
    defaultMessage: "Push to Iterable",
    description: "Title of the Content editor dialog for choosing Iterable items to push",
  },
  selectItemsDescription: {
    id: "Zbyw15pS8D",
    defaultMessage:
      "Choose which mapped templates and snippets to update with approved translations. This only writes content — it never sends.",
    description: "Description of the Iterable item picker dialog",
  },
  pushPolicyLabel: {
    id: "5QCLOyM73i",
    defaultMessage: "Push policy",
    description: "Label for the selected automation Iterable overwrite rule",
  },
  pushPolicyOverwrite: {
    id: "7UHXRMjl+Y",
    defaultMessage: "Overwrite Iterable locales when the remote locale is newer.",
    description: "Explains the selected automation overwrites newer Iterable locales on push",
  },
  pushPolicyKeepRemote: {
    id: "alcSK9nCuh",
    defaultMessage: "Keep Iterable locales that teammates edited after the last push.",
    description: "Explains the selected automation keeps newer Iterable locales",
  },
  automationLabel: {
    id: "j5ubVN2OC1",
    defaultMessage: "Automation",
    description: "Label for choosing which Iterable automation to push with",
  },
  searchItemsPlaceholder: {
    id: "r2K/PgwYTn",
    defaultMessage: "Search templates and snippets",
    description: "Placeholder for filtering mapped Iterable items",
  },
  searchItemsLabel: {
    id: "Sgi+3mXXoM",
    defaultMessage: "Search templates and snippets",
    description: "Accessible label for the Iterable item search field",
  },
  selectAllItems: {
    id: "UydwfJCeri",
    defaultMessage: "Select all",
    description: "Select every mapped Iterable item in the push dialog",
  },
  clearItemSelection: {
    id: "RYBotpnmvI",
    defaultMessage: "Clear",
    description: "Clear the Iterable item selection",
  },
  loadingItems: {
    id: "Yg2qF7M7gl",
    defaultMessage: "Loading items",
    description: "Shown while mapped Iterable items load",
  },
  loadItemsError: {
    id: "5grheSIGTQ",
    defaultMessage: "Could not load items",
    description: "Error when mapped Iterable items fail to load",
  },
  noItems: {
    id: "4zcExBLEmu",
    defaultMessage: "No mapped items",
    description: "Empty state when an Iterable automation has no mapped items",
  },
  noMatchingItems: {
    id: "B0/2ASstHC",
    defaultMessage: "No matching items",
    description: "Empty state when item search matches nothing",
  },
  lastPushFailed: {
    id: "+sgsB9DEsj",
    defaultMessage: "Last push failed",
    description: "Hint that the previous Iterable push for this item failed",
  },
  cancelItemSelection: {
    id: "oc+DvbN58n",
    defaultMessage: "Cancel",
    description: "Cancel the Iterable item picker",
  },
  pushSelectedItems: {
    id: "3q2/mI8JxD",
    defaultMessage: "Push {count, plural, one {# item} other {# items}}",
    description: "Confirm pushing the selected Iterable items",
  },
  ingestButton: {
    id: "kj2WQoWU56",
    defaultMessage: "Import from Iterable",
    description: "Button that queues an Iterable import automation run from the Content editor",
  },
});
