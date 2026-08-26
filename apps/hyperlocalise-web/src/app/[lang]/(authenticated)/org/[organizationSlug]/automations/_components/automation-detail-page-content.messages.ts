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

export const automationDetailPageContentMessages = defineMessages({
  updateSuccess: {
    defaultMessage: "Automation updated",
    id: "TqKPfOkj7i",
    description: "Toast when a workspace automation is saved successfully",
  },
  updateError: {
    defaultMessage: "Unable to save automation right now",
    id: "YzNLnailQi",
    description: "Toast when saving a workspace automation fails",
  },
  runQueued: {
    defaultMessage: "Manual run queued",
    id: "pMNkzc+47V",
    description: "Toast when a manual automation run is queued successfully",
  },
  runError: {
    defaultMessage: "Unable to queue a manual run right now",
    id: "6zAmu9E3FT",
    description: "Toast when queueing a manual automation run fails",
  },
  sourceFilesQueued: {
    defaultMessage:
      "{queued, plural, =0 {No automation runs queued} one {# automation run queued} other {# automation runs queued}}",
    id: "Z9/shXBMll",
    description: "Toast after existing source files are selected for automation runs",
  },
  sourceFilesRunError: {
    defaultMessage: "Unable to run the automation for the selected files",
    id: "AM12LbMoJG",
    description: "Toast when the automation cannot run for selected source files",
  },
  loading: {
    defaultMessage: "Loading automation...",
    id: "YGyu9mb0BB",
    description: "Loading state while an automation detail page is fetching",
  },
  runNow: {
    defaultMessage: "Run now",
    id: "P5eC/nlEOZ",
    description: "Button to queue a manual automation run",
  },
  selectSourceFiles: {
    defaultMessage: "Select source files to run this automation",
    id: "ngIYrv4Oy/",
    description: "Accessible label for the manual source-file automation picker",
  },
  selectSourceFilesTitle: {
    defaultMessage: "Select source files",
    id: "f0r7Ci89gS",
    description: "Title for the existing source-file selection dialog",
  },
  selectSourceFilesDescription: {
    defaultMessage: "Choose one or more existing project files. Each file starts its own run.",
    id: "oAaG6RQRA7",
    description: "Description for the existing source-file selection dialog",
  },
  searchSourceFilesPlaceholder: {
    defaultMessage: "Search files…",
    id: "+2VYvugvF6",
    description: "Placeholder for filtering existing source files",
  },
  searchSourceFilesLabel: {
    defaultMessage: "Search source files",
    id: "8Fdhfjv0NO",
    description: "Accessible label for the source-file search input",
  },
  loadingSourceFiles: {
    defaultMessage: "Loading source files…",
    id: "ECvp3Us0vA",
    description: "Loading message in the source-file selection dialog",
  },
  loadSourceFilesError: {
    defaultMessage: "Unable to load source files",
    id: "wLreqnuDf7",
    description: "Error in the source-file selection dialog",
  },
  noSourceFiles: {
    defaultMessage: "No source files found",
    id: "VapVL5JCf1",
    description: "Empty state in the source-file selection dialog",
  },
  cancelSourceFileSelection: {
    defaultMessage: "Cancel",
    id: "VYElnDXHUS",
    description: "Button to close the source-file selection dialog",
  },
  runSelectedSourceFiles: {
    defaultMessage: "Run {count, plural, one {# file} other {# files}}",
    id: "b+el1VIvgt",
    description: "Button to run the automation for selected source files",
  },
  openChat: {
    defaultMessage: "Open chat",
    id: "+YUbta511H",
    description: "Button to open the public web chat for this automation",
  },
  saving: {
    defaultMessage: "Saving...",
    id: "4mzmyHsHW0",
    description: "Save button label while the automation update request is pending",
  },
  saveChanges: {
    defaultMessage: "Save changes",
    id: "F6jskX12It",
    description: "Button to save automation detail changes",
  },
  backToAutomations: {
    defaultMessage: "Back to automations",
    id: "aEJ2kyKHZN",
    description: "Link back to the workspace automations list",
  },
  deleteAutomation: {
    defaultMessage: "Delete",
    id: "oY6BbYTIO4",
    description: "Button to delete a workspace automation",
  },
  deleteTitle: {
    defaultMessage: "Delete automation?",
    id: "+G79JE1NJw",
    description: "Title of the delete automation confirmation dialog",
  },
  deleteDescription: {
    defaultMessage: "{automationName} will be removed from this workspace and will no longer run.",
    id: "jlepO5Bf/R",
    description: "Delete automation confirmation describing the selected automation",
  },
  deleteCancel: {
    defaultMessage: "Cancel",
    id: "5LQhHEkaW9",
    description: "Cancel button in the delete automation dialog",
  },
  deleting: {
    defaultMessage: "Deleting...",
    id: "qPScSvuMGL",
    description: "Delete button label while an automation is being deleted",
  },
  deleteConfirm: {
    defaultMessage: "Delete",
    id: "nCW7Lueszj",
    description: "Confirm button to delete a workspace automation",
  },
  deleteSuccess: {
    defaultMessage: "Automation deleted",
    id: "vnJqxWYdFd",
    description: "Toast when a workspace automation is deleted successfully",
  },
  deleteError: {
    defaultMessage: "Unable to delete automation right now",
    id: "jqb6LSQ7FV",
    description: "Toast when deleting a workspace automation fails",
  },
});
