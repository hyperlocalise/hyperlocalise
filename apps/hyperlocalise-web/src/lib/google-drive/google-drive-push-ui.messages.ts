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

export const googleDrivePushUiMessages = defineMessages({
  pushButton: {
    defaultMessage: "Push to Google Drive",
    id: "Y/Nm0Xd+Mh",
    description: "Button that opens the dialog to write approved translations to Google Drive",
  },
  pushQueued: {
    defaultMessage: "Google Drive files queued",
    id: "klx3Z6LqU/",
    description: "Toast after a Google Drive push automation run is queued",
  },
  pushFailed: {
    defaultMessage: "Could not queue Google Drive push",
    id: "0vlTKdqpJ0",
    description: "Toast when queuing a Google Drive push automation run fails",
  },
  selectFilesTitle: {
    defaultMessage: "Push to Google Drive",
    id: "R1kTHckieD",
    description: "Title of the Content editor dialog for choosing Google Drive files to push",
  },
  selectFilesDescription: {
    defaultMessage:
      "Choose which mapped files to write back to Google Drive using this automation’s translation output format.",
    id: "KLQrtgraoy",
    description: "Description of the Google Drive file picker dialog",
  },
  automationLabel: {
    defaultMessage: "Automation",
    id: "/3IebsnqkD",
    description: "Label for choosing which Google Drive automation to push with",
  },
  searchFilesPlaceholder: {
    defaultMessage: "Search files",
    id: "zyYnZ9Lo4u",
    description: "Placeholder for filtering mapped Google Drive files",
  },
  searchFilesLabel: {
    defaultMessage: "Search files",
    id: "J6DRapAgvg",
    description: "Accessible label for the Google Drive file search field",
  },
  selectAllFiles: {
    defaultMessage: "Select all",
    id: "ZgK1ntJgO9",
    description: "Select every mapped Google Drive file in the push dialog",
  },
  clearFileSelection: {
    defaultMessage: "Clear",
    id: "Xzir0UykNi",
    description: "Clear the Google Drive file selection",
  },
  loadingFiles: {
    defaultMessage: "Loading files",
    id: "6nDRuZiUYw",
    description: "Shown while mapped Google Drive files load",
  },
  loadFilesError: {
    defaultMessage: "Could not load files",
    id: "jVKe+0rRwL",
    description: "Error when mapped Google Drive files fail to load",
  },
  noFiles: {
    defaultMessage: "No mapped files",
    id: "vbYpX59SOe",
    description: "Empty state when a Google Drive automation has no mapped files",
  },
  noMatchingFiles: {
    defaultMessage: "No matching files",
    id: "PWg4LJvEJP",
    description: "Empty state when file search matches nothing",
  },
  readyLocales: {
    defaultMessage: "{ready} of {total} locales ready",
    id: "kYL2riWJTH",
    description: "How many mapped locales are ready to push for one file",
  },
  lastPushFailed: {
    defaultMessage: "Last push failed",
    id: "ngGsi4lPve",
    description: "Hint that the previous Google Drive push for this file failed",
  },
  cancelFileSelection: {
    defaultMessage: "Cancel",
    id: "7j8p6OASUd",
    description: "Cancel the Google Drive file picker",
  },
  pushSelectedFiles: {
    defaultMessage: "Push {count, plural, one {# file} other {# files}}",
    id: "xzKs+0e2wQ",
    description: "Confirm pushing the selected Google Drive files",
  },
});
