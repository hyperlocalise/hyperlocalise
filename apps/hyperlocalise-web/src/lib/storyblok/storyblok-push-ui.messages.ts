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

export const storyblokPushUiMessages = defineMessages({
  pushButton: {
    id: "wgncY8vQLm",
    defaultMessage: "Push to Storyblok",
    description: "Button that opens the dialog to write approved translations to Storyblok",
  },
  pushQueued: {
    id: "HiZ3zFIgSF",
    defaultMessage: "Storyblok push queued",
    description: "Toast after a Storyblok push automation run is queued",
  },
  pushFailed: {
    id: "FlnUu+fgEO",
    defaultMessage: "Could not queue Storyblok push",
    description: "Toast when queuing a Storyblok push automation run fails",
  },
  selectDocumentsTitle: {
    id: "Vm/01gnOo4",
    defaultMessage: "Push to Storyblok",
    description: "Title of the Content editor dialog for choosing Storyblok stories to push",
  },
  selectDocumentsDescription: {
    id: "9LtFG+rOJD",
    defaultMessage:
      "Choose which imported stories to update. Approved translations are written as field-level translations. Stories are not published.",
    description: "Description of the Storyblok story picker dialog",
  },
  automationLabel: {
    id: "3UiqM/Asqu",
    defaultMessage: "Automation",
    description: "Label for choosing which Storyblok automation to push with",
  },
  searchDocumentsPlaceholder: {
    id: "KEkaqxy1+/",
    defaultMessage: "Search stories",
    description: "Placeholder for filtering imported Storyblok stories",
  },
  searchDocumentsLabel: {
    id: "jauIrloLXZ",
    defaultMessage: "Search stories",
    description: "Accessible label for the Storyblok story search field",
  },
  selectAllDocuments: {
    id: "fkalHdpgw/",
    defaultMessage: "Select all",
    description: "Select every imported Storyblok story in the push dialog",
  },
  clearDocumentSelection: {
    id: "t56OK53cmU",
    defaultMessage: "Clear",
    description: "Clear the Storyblok story selection",
  },
  loadingDocuments: {
    id: "kvvnfTxT7q",
    defaultMessage: "Loading stories",
    description: "Shown while imported Storyblok stories load",
  },
  loadDocumentsError: {
    id: "yCWzSAZpGe",
    defaultMessage: "Could not load stories",
    description: "Error when imported Storyblok stories fail to load",
  },
  noDocuments: {
    id: "WSDHK7T+R3",
    defaultMessage: "No imported stories",
    description: "Empty state when a Storyblok automation has no imported stories",
  },
  noMatchingDocuments: {
    id: "n+MZmNWhL2",
    defaultMessage: "No matching stories",
    description: "Empty state when story search matches nothing",
  },
  lastPushFailed: {
    id: "saan9//3+L",
    defaultMessage: "Last push failed",
    description: "Hint that the previous Storyblok push for this story failed",
  },
  cancelDocumentSelection: {
    id: "b+VZtbWKyH",
    defaultMessage: "Cancel",
    description: "Cancel the Storyblok story picker",
  },
  pushSelectedDocuments: {
    id: "K9L977Zxv6",
    defaultMessage: "Push {count, plural, one {# story} other {# stories}}",
    description: "Confirm pushing the selected Storyblok stories as field-level translations",
  },
});
