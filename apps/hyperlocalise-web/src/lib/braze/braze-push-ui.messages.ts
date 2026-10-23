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

export const brazePushUiMessages = defineMessages({
  pushButton: {
    id: "MaPGsx9bEV",
    defaultMessage: "Push to Braze",
    description:
      "Button that opens the dialog to write approved template translations as Braze copies",
  },
  pushQueued: {
    id: "8BjXjIaYA0",
    defaultMessage: "Braze copies queued",
    description: "Toast after a Braze push automation run is queued",
  },
  pushFailed: {
    id: "5jzwdCgA6N",
    defaultMessage: "Could not queue Braze push",
    description: "Toast when queuing a Braze push automation run fails",
  },
  selectItemsTitle: {
    id: "FlPWUrrx1/",
    defaultMessage: "Push to Braze",
    description: "Title of the Content editor dialog for choosing Braze templates to push",
  },
  selectItemsDescription: {
    id: "oaXbMTwJdB",
    defaultMessage:
      "Choose which mapped templates to write as locale-suffixed Braze copies. This does not change the source or publish.",
    description: "Description of the Braze template picker dialog",
  },
  pushPolicyLabel: {
    id: "4XH7iM6vvN",
    defaultMessage: "Push policy",
    description: "Label for the selected automation Braze overwrite rule",
  },
  pushPolicyOverwrite: {
    id: "bw1KuJJnSd",
    defaultMessage: "Overwrite Braze copies when the remote copy is newer.",
    description: "Explains the selected automation overwrites newer Braze copies on push",
  },
  pushPolicyKeepRemote: {
    id: "3pH+V4sVcw",
    defaultMessage: "Keep Braze copies that teammates edited after the last push.",
    description: "Explains the selected automation keeps newer Braze copies",
  },
  automationLabel: {
    id: "FnAFjBOuRk",
    defaultMessage: "Automation",
    description: "Label for choosing which Braze automation to push with",
  },
  searchItemsPlaceholder: {
    id: "eg1vE4iGCz",
    defaultMessage: "Search templates",
    description: "Placeholder for filtering mapped Braze templates",
  },
  searchItemsLabel: {
    id: "k0hm/w7zMc",
    defaultMessage: "Search templates",
    description: "Accessible label for the Braze template search field",
  },
  selectAllItems: {
    id: "RIwi4j2nfJ",
    defaultMessage: "Select all",
    description: "Select every mapped Braze template in the push dialog",
  },
  clearItemSelection: {
    id: "mAUk8+MP8l",
    defaultMessage: "Clear",
    description: "Clear the Braze template selection",
  },
  loadingItems: {
    id: "hTDYqJqQym",
    defaultMessage: "Loading templates",
    description: "Shown while mapped Braze templates load",
  },
  loadItemsError: {
    id: "7uzrd7Mdbz",
    defaultMessage: "Could not load templates",
    description: "Error when mapped Braze templates fail to load",
  },
  noItems: {
    id: "XzOJmiyvap",
    defaultMessage: "No mapped templates",
    description: "Empty state when a Braze automation has no mapped templates",
  },
  noMatchingItems: {
    id: "D2gUlNzO0G",
    defaultMessage: "No matching templates",
    description: "Empty state when template search matches nothing",
  },
  lastPushFailed: {
    id: "8KWdpo1+b6",
    defaultMessage: "Last push failed",
    description: "Hint that the previous Braze push for this template failed",
  },
  cancelItemSelection: {
    id: "3+pjmT77Xm",
    defaultMessage: "Cancel",
    description: "Cancel the Braze template picker",
  },
  pushSelectedItems: {
    id: "fut6xXSrSN",
    defaultMessage: "Push {count, plural, one {# template} other {# templates}}",
    description: "Confirm pushing the selected Braze templates as locale copies",
  },
});
