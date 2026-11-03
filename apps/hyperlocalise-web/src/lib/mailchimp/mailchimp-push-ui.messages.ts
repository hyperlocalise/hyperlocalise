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

export const mailchimpPushUiMessages = defineMessages({
  pushButton: {
    id: "doi1CJtNyr",
    defaultMessage: "Push to Mailchimp",
    description: "Button that opens the dialog to write approved translations to Mailchimp",
  },
  pushQueued: {
    id: "/HLvk6zVvS",
    defaultMessage: "Mailchimp push queued",
    description: "Toast after a Mailchimp push automation run is queued",
  },
  pushFailed: {
    id: "IKd49tYfPp",
    defaultMessage: "Could not queue Mailchimp push",
    description: "Toast when queuing a Mailchimp push automation run fails",
  },
  selectItemsTitle: {
    id: "kezpjBwZx/",
    defaultMessage: "Push to Mailchimp",
    description: "Title of the Content editor dialog for choosing Mailchimp items to push",
  },
  selectItemsDescription: {
    id: "vmE0N0SGD3",
    defaultMessage:
      "Choose which mapped campaigns or templates to update with approved translations. This creates or updates draft locale copies — it never sends, schedules, or edits the source.",
    description: "Description of the Mailchimp item picker dialog",
  },
  pushPolicyLabel: {
    id: "EY3bu6oe+F",
    defaultMessage: "Push policy",
    description: "Label for the selected automation Mailchimp overwrite rule",
  },
  pushPolicyOverwrite: {
    id: "hB5ZTWFDwg",
    defaultMessage: "Overwrite Mailchimp copies when the remote copy is newer.",
    description: "Explains the selected automation overwrites newer Mailchimp copies on push",
  },
  pushPolicyKeepRemote: {
    id: "3iL4qh0106",
    defaultMessage: "Keep Mailchimp copies that teammates edited after the last push.",
    description: "Explains the selected automation keeps newer Mailchimp copies",
  },
  automationLabel: {
    id: "ZoFvC2Y6/K",
    defaultMessage: "Automation",
    description: "Label for choosing which Mailchimp automation to push with",
  },
  searchItemsPlaceholder: {
    id: "DTdpbMkjDX",
    defaultMessage: "Search items",
    description: "Placeholder for filtering mapped Mailchimp items",
  },
  searchItemsLabel: {
    id: "+VUamUeb+A",
    defaultMessage: "Search items",
    description: "Accessible label for the Mailchimp item search field",
  },
  selectAllItems: {
    id: "TPurI7fr5b",
    defaultMessage: "Select all",
    description: "Select every mapped Mailchimp item in the push dialog",
  },
  clearItemSelection: {
    id: "P+L9qIX8Rd",
    defaultMessage: "Clear",
    description: "Clear the Mailchimp item selection",
  },
  loadingItems: {
    id: "eR+n3IPBGs",
    defaultMessage: "Loading items",
    description: "Shown while mapped Mailchimp items load",
  },
  loadItemsError: {
    id: "6/Rw622IOT",
    defaultMessage: "Could not load items",
    description: "Error when mapped Mailchimp items fail to load",
  },
  noItems: {
    id: "A9wBlxBz/7",
    defaultMessage: "No mapped items",
    description: "Empty state when a Mailchimp automation has no mapped items",
  },
  noMatchingItems: {
    id: "B0/2ASstHC",
    defaultMessage: "No matching items",
    description: "Empty state when item search matches nothing",
  },
  lastPushFailed: {
    id: "3zToCXkiyk",
    defaultMessage: "Last push failed",
    description: "Hint that the previous Mailchimp push for this item failed",
  },
  cancelItemSelection: {
    id: "0MlVUFY5rP",
    defaultMessage: "Cancel",
    description: "Cancel the Mailchimp item picker",
  },
  pushSelectedItems: {
    id: "WLGzcjbMSX",
    defaultMessage: "Push {count, plural, one {# item} other {# items}}",
    description: "Confirm pushing the selected Mailchimp items",
  },
});
