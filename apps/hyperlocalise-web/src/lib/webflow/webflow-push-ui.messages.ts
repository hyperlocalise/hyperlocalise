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

export const webflowPushUiMessages = defineMessages({
  pushButton: {
    id: "iSa9ttLMLw",
    defaultMessage: "Push to Webflow",
    description: "Button that opens the dialog to write approved translations to Webflow",
  },
  pushQueued: {
    id: "1Z9saVoMiV",
    defaultMessage: "Webflow push queued",
    description: "Toast after a Webflow push automation run is queued",
  },
  pushFailed: {
    id: "8oiNLPy05p",
    defaultMessage: "Could not queue Webflow push",
    description: "Toast when queuing a Webflow push automation run fails",
  },
  selectDocumentsTitle: {
    id: "ptKeippc4Q",
    defaultMessage: "Push to Webflow",
    description: "Title of the Content editor dialog for choosing Webflow items to push",
  },
  selectDocumentsDescription: {
    id: "0aWc+XdUSl",
    defaultMessage:
      "Choose which mapped collection items to write to staged secondary locales. This publishes the site locales when the automation is configured to publish.",
    description: "Description of the Webflow item picker dialog",
  },
  automationLabel: {
    id: "zjx5sBHSz8",
    defaultMessage: "Automation",
    description: "Label for choosing which Webflow automation to push with",
  },
  searchDocumentsPlaceholder: {
    id: "2G2BsJhU36",
    defaultMessage: "Search items",
    description: "Placeholder for filtering mapped Webflow items",
  },
  searchDocumentsLabel: {
    id: "dgwwa5fmIa",
    defaultMessage: "Search items",
    description: "Accessible label for the Webflow item search field",
  },
  selectAllDocuments: {
    id: "SD6Q8vRqh7",
    defaultMessage: "Select all",
    description: "Select every mapped Webflow item in the push dialog",
  },
  clearDocumentSelection: {
    id: "ZvDB2JJIOx",
    defaultMessage: "Clear",
    description: "Clear the Webflow item selection",
  },
  loadingDocuments: {
    id: "W4ZKVctAzk",
    defaultMessage: "Loading items",
    description: "Shown while mapped Webflow items load",
  },
  loadDocumentsError: {
    id: "s3/7UeDIEK",
    defaultMessage: "Could not load items",
    description: "Error when mapped Webflow items fail to load",
  },
  noDocuments: {
    id: "QVExWhLOpQ",
    defaultMessage: "No mapped items",
    description: "Empty state when a Webflow automation has no mapped items",
  },
  noMatchingDocuments: {
    id: "B0/2ASstHC",
    defaultMessage: "No matching items",
    description: "Empty state when item search matches nothing",
  },
  lastPushFailed: {
    id: "4vC24ob+UL",
    defaultMessage: "Last push failed",
    description: "Hint that the previous Webflow push for this item failed",
  },
  cancelDocumentSelection: {
    id: "jvDgxYw2AM",
    defaultMessage: "Cancel",
    description: "Cancel the Webflow item picker",
  },
  pushSelectedDocuments: {
    id: "Is6XLNneen",
    defaultMessage: "Push {count, plural, one {# item} other {# items}}",
    description: "Confirm pushing the selected Webflow items to secondary locales",
  },
});
