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

export const sanityPushUiMessages = defineMessages({
  pushButton: {
    id: "FIhOKfaVlC",
    defaultMessage: "Push to Sanity",
    description: "Button that opens the dialog to write approved translations to Sanity",
  },
  pushQueued: {
    id: "TOOyOuwji9",
    defaultMessage: "Sanity drafts queued",
    description: "Toast after an Sanity draft push automation run is queued",
  },
  pushFailed: {
    id: "67WAInF3FG",
    defaultMessage: "Could not queue Sanity push",
    description: "Toast when queuing an Sanity push automation run fails",
  },
  selectDocumentsTitle: {
    id: "Hbeo2X1h7u",
    defaultMessage: "Push to Sanity",
    description: "Title of the Content editor dialog for choosing Sanity documents to push",
  },
  selectDocumentsDescription: {
    id: "3jHsl1C8Cv",
    defaultMessage:
      "Choose which mapped documents to write as Sanity drafts. This does not publish.",
    description: "Description of the Sanity document picker dialog",
  },
  pushPolicyLabel: {
    id: "gzPrVIj8XL",
    defaultMessage: "Push policy",
    description: "Label for the selected automation Sanity push overwrite rule",
  },
  pushPolicyOverwrite: {
    id: "L+YqXrfYaG",
    defaultMessage: "Overwrite Sanity drafts when the remote target is newer.",
    description: "Explains the selected automation overwrites newer Sanity drafts on push",
  },
  pushPolicyKeepRemote: {
    id: "dSWTPScGc1",
    defaultMessage:
      "Keep Sanity drafts that teammates edited after the last push. Unchanged approved text is skipped.",
    description:
      "Explains the selected automation keeps newer Sanity drafts and skips unchanged locales",
  },
  automationLabel: {
    id: "t2J9JYDAdD",
    defaultMessage: "Automation",
    description: "Label for choosing which Sanity automation to push with",
  },
  searchDocumentsPlaceholder: {
    id: "PYRZ6kqxOc",
    defaultMessage: "Search documents",
    description: "Placeholder for filtering mapped Sanity documents",
  },
  searchDocumentsLabel: {
    id: "3Fwkb+iT9m",
    defaultMessage: "Search documents",
    description: "Accessible label for the Sanity document search field",
  },
  selectAllDocuments: {
    id: "d9nNGb3zA6",
    defaultMessage: "Select all",
    description: "Select every mapped Sanity document in the push dialog",
  },
  clearDocumentSelection: {
    id: "0Xwa8SHaHR",
    defaultMessage: "Clear",
    description: "Clear the Sanity document selection",
  },
  loadingDocuments: {
    id: "L9/oqyP9pk",
    defaultMessage: "Loading documents",
    description: "Shown while mapped Sanity documents load",
  },
  loadDocumentsError: {
    id: "FGNo/uvZ2J",
    defaultMessage: "Could not load documents",
    description: "Error when mapped Sanity documents fail to load",
  },
  noDocuments: {
    id: "pcA83SydbQ",
    defaultMessage: "No mapped documents",
    description: "Empty state when an Sanity automation has no mapped documents",
  },
  noMatchingDocuments: {
    id: "uxSSj1bXpa",
    defaultMessage: "No matching documents",
    description: "Empty state when document search matches nothing",
  },
  readyLocales: {
    id: "kGCOhOWZ0P",
    defaultMessage: "{ready} of {total} locales ready",
    description: "How many mapped locales are ready to push for one document",
  },
  lastPushFailed: {
    id: "+Xor30vD6J",
    defaultMessage: "Last push failed",
    description: "Hint that the previous Sanity push for this document failed",
  },
  cancelDocumentSelection: {
    id: "0eh0U1m44o",
    defaultMessage: "Cancel",
    description: "Cancel the Sanity document picker",
  },
  pushSelectedDocuments: {
    id: "MsvsV+2oWf",
    defaultMessage: "Push {count, plural, one {# document} other {# documents}}",
    description: "Confirm pushing the selected Sanity documents as drafts",
  },
});
