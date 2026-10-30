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

export const hubspotPushUiMessages = defineMessages({
  pushButton: {
    id: "ydKsI5HS/s",
    defaultMessage: "Push to HubSpot",
    description: "Button that opens the dialog to write approved translations to HubSpot",
  },
  pushQueued: {
    id: "D3kQXWPcCW",
    defaultMessage: "HubSpot push queued",
    description: "Toast after a HubSpot push automation run is queued",
  },
  pushFailed: {
    id: "sg405N0flU",
    defaultMessage: "Could not queue HubSpot push",
    description: "Toast when queuing a HubSpot push automation run fails",
  },
  selectItemsTitle: {
    id: "g5Lt85UaO9",
    defaultMessage: "Push to HubSpot",
    description: "Title of the Content editor dialog for choosing HubSpot items to push",
  },
  selectItemsDescription: {
    id: "cio6/YsJRi",
    defaultMessage:
      "Choose which mapped emails, forms, blog posts, landing pages, website pages, and message templates to update with approved translations. This creates locale copies and never changes or publishes the source.",
    description: "Description of the HubSpot item picker dialog",
  },
  pushPolicyLabel: {
    id: "bsYaITED8a",
    defaultMessage: "Push policy",
    description: "Label for the selected automation HubSpot overwrite rule",
  },
  pushPolicyOverwrite: {
    id: "KKwJDyo6Qn",
    defaultMessage: "Overwrite HubSpot copies when the remote copy is newer.",
    description: "Explains the selected automation overwrites newer HubSpot copies on push",
  },
  pushPolicyKeepRemote: {
    id: "+TnElwCqk4",
    defaultMessage: "Keep HubSpot copies that teammates edited after the last push.",
    description: "Explains the selected automation keeps newer HubSpot copies",
  },
  automationLabel: {
    id: "q1Z6cLN3TO",
    defaultMessage: "Automation",
    description: "Label for choosing which HubSpot automation to push with",
  },
  searchItemsPlaceholder: {
    id: "7hm07cqAw8",
    defaultMessage: "Search items",
    description: "Placeholder for filtering mapped HubSpot items",
  },
  searchItemsLabel: {
    id: "Atsclr94+y",
    defaultMessage: "Search items",
    description: "Accessible label for the HubSpot item search field",
  },
  selectAllItems: {
    id: "55xv+A+K/m",
    defaultMessage: "Select all",
    description: "Select every mapped HubSpot item in the push dialog",
  },
  clearItemSelection: {
    id: "e0CvlXJ4ct",
    defaultMessage: "Clear",
    description: "Clear the HubSpot item selection",
  },
  loadingItems: {
    id: "eekYo93LGz",
    defaultMessage: "Loading items",
    description: "Shown while mapped HubSpot items load",
  },
  loadItemsError: {
    id: "y7wsSxtRQK",
    defaultMessage: "Could not load items",
    description: "Error when mapped HubSpot items fail to load",
  },
  noItems: {
    id: "XzGaaTP1ZJ",
    defaultMessage: "No mapped items",
    description: "Empty state when a HubSpot automation has no mapped items",
  },
  noMatchingItems: {
    id: "bf0TtMsCUG",
    defaultMessage: "No matching items",
    description: "Empty state when HubSpot item search matches nothing",
  },
  lastPushFailed: {
    id: "B7iMFgP2e0",
    defaultMessage: "Last push failed",
    description: "Hint that the previous HubSpot push for this item failed",
  },
  cancelItemSelection: {
    id: "kse6ogMy60",
    defaultMessage: "Cancel",
    description: "Cancel the HubSpot item picker",
  },
  pushSelectedItems: {
    id: "xVjKDBvqPx",
    defaultMessage: "Push {count, plural, one {# item} other {# items}}",
    description: "Confirm pushing the selected HubSpot items",
  },
});
