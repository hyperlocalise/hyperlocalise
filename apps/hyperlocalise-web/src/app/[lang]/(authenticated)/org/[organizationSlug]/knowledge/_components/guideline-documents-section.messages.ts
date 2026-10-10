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

export const guidelineDocumentsSectionMessages = defineMessages({
  title: {
    defaultMessage: "Uploaded guidelines",
    id: "smqbhPW1UB",
    description: "Heading for the list of uploaded guideline documents",
  },
  description: {
    defaultMessage:
      "Hyperlocalise reads these files and applies them to translations and guideline checks.",
    id: "kLU1GvKRGe",
    description: "Explanation shown above the list of uploaded guideline documents",
  },
  loadFailed: {
    defaultMessage: "Unable to load uploaded guidelines.",
    id: "tVY9dqD8RG",
    description: "Error shown when uploaded guideline documents fail to load",
  },
  retry: {
    defaultMessage: "Retry",
    id: "qzdjoywlSe",
    description: "Button to retry loading uploaded guideline documents",
  },
  processing: {
    defaultMessage: "Processing",
    id: "XVzHC8py80",
    description: "Status badge for a guideline document that is still being read",
  },
  ready: {
    defaultMessage: "Ready",
    id: "Jx4SYqNfS9",
    description: "Status badge for a guideline document that is ready to use",
  },
  failed: {
    defaultMessage: "Failed",
    id: "F8dRl91XI1",
    description: "Status badge for a guideline document that could not be read",
  },
  allLocales: {
    defaultMessage: "All locales",
    id: "HdjslZ2CfZ",
    description: "Label for a guideline document that applies to every target locale",
  },
  characters: {
    defaultMessage: "{count, plural, one {# character} other {# characters}}",
    id: "biMhDQg4+R",
    description: "Number of characters read from a guideline document",
  },
  truncated: {
    defaultMessage: "Only the beginning of this file is used because it is very long.",
    id: "XE2fpGArfr",
    description: "Notice that a guideline document was truncated during extraction",
  },
  alwaysApply: {
    defaultMessage: "Always apply",
    id: "Si4jICTmG4",
    description: "Label for the switch that makes a guideline document mandatory",
  },
  delete: {
    defaultMessage: "Delete",
    id: "G8enB0YSsL",
    description: "Button to delete an uploaded guideline document",
  },
  deleteTitle: {
    defaultMessage: "Delete this guideline?",
    id: "7I6/WHswGm",
    description: "Title of the dialog confirming deletion of a guideline document",
  },
  deleteBody: {
    defaultMessage: "{title} will no longer be used for translations or guideline checks.",
    id: "cFmrFVXzNK",
    description: "Body of the dialog confirming deletion of a guideline document",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "v4m3Kj0t7W",
    description: "Button to close the guideline deletion dialog",
  },
  uploadStarted: {
    defaultMessage: "{filename} uploaded. Processing has started.",
    id: "slNRGSuQyX",
    description: "Toast after a guideline document upload is accepted",
  },
  uploadFailed: {
    defaultMessage: "Unable to upload {filename}.",
    id: "+wsFK+FHmB",
    description: "Toast when a guideline document upload fails",
  },
  updateFailed: {
    defaultMessage: "Unable to update the guideline.",
    id: "ec1GED0x/h",
    description: "Toast when changing a guideline document setting fails",
  },
  deleteFailed: {
    defaultMessage: "Unable to delete the guideline.",
    id: "/sWML9CPu/",
    description: "Toast when deleting a guideline document fails",
  },
  errorNoText: {
    defaultMessage: "No readable text was found in this file.",
    id: "HNyt1NxH1D",
    description: "Reason a guideline document failed: the file has no text",
  },
  errorUnsupported: {
    defaultMessage: "This file format is not supported.",
    id: "ZUjeDr0kJm",
    description: "Reason a guideline document failed: unsupported format",
  },
  errorTooLarge: {
    defaultMessage: "This file is too large to process.",
    id: "aqL5Q4cYQs",
    description: "Reason a guideline document failed: the file is too large",
  },
  errorEncrypted: {
    defaultMessage: "This file is password protected.",
    id: "qjq5t+YcOG",
    description: "Reason a guideline document failed: the file is encrypted",
  },
  errorMalformed: {
    defaultMessage: "This file appears to be damaged.",
    id: "r+yexMeuDZ",
    description: "Reason a guideline document failed: the file is malformed",
  },
  errorEnqueueRetrying: {
    defaultMessage: "Processing will retry automatically.",
    id: "kN0LAIxQ9l",
    description:
      "Reason shown when guideline ingest enqueue failed but the server will retry via sweep",
  },
  errorGeneric: {
    defaultMessage: "This file could not be processed. Upload it again to retry.",
    id: "5PnVdIytmB",
    description: "Reason a guideline document failed for an unknown or transient reason",
  },
});
