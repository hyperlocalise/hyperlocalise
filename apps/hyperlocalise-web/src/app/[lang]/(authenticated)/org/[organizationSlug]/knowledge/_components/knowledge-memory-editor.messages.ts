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

export const knowledgeMemoryEditorMessages = defineMessages({
  title: {
    defaultMessage: "Global guidance",
    id: "6F6O0hv6yy",
    description: "Heading for the global guidance editor",
  },
  lastUpdated: {
    defaultMessage: "Saved {timestamp}",
    id: "OVYNR7qNg7",
    description: "Shows when global guidance was last saved",
  },
  notSavedYet: {
    defaultMessage: "Not saved yet",
    id: "pzP0LynEOg",
    description: "Shown when organization knowledge memory has never been saved",
  },
  memoryPlaceholder: {
    defaultMessage:
      "Add terminology, market insights, compliance requirements, launch guidance, and things to avoid…",
    id: "/y+q4g0L8i",
    description: "Placeholder for the global guidance TipTap editor",
  },
  memoryAriaLabel: {
    defaultMessage: "Global guidance",
    id: "DR05xC0qfm",
    description: "Accessible label for the global guidance TipTap editor",
  },
  versionNoteLabel: {
    defaultMessage: "Version note (optional)",
    id: "DHd5WNIV7o",
    description: "Label for the optional knowledge memory version note field",
  },
  versionNotePlaceholder: {
    defaultMessage: "Updated product terminology",
    id: "Ok15bFijfb",
    description: "Placeholder for the optional knowledge memory version note field",
  },
  overLimitError: {
    defaultMessage: "Guideline must be {limit} characters or less.",
    id: "z5B/SjTaZR",
    description: "Error when the organization guideline exceeds the character limit",
  },
  characterCount: {
    defaultMessage: "{count}/{limit} characters",
    id: "crhiHIjb38",
    description: "Character count for the organization knowledge memory editor",
  },
  unsavedChanges: {
    defaultMessage: "Unsaved changes",
    id: "kYhhhQsEy6",
    description: "Status shown when global guidance has local changes",
  },
  changesSaved: {
    defaultMessage: "All changes saved",
    id: "fvlbrsgBUm",
    description: "Status shown when global guidance matches the saved version",
  },
  history: {
    defaultMessage: "History",
    id: "4vgdKa1rPI",
    description: "Button to open knowledge memory revision history",
  },
  committing: {
    defaultMessage: "Saving",
    id: "iN2/ib2XhV",
    description: "Commit button label while knowledge memory is saving",
  },
  commitChanges: {
    defaultMessage: "Save changes",
    id: "h8EKkv2BNt",
    description: "Commit button label for knowledge memory",
  },
  saveDialogTitle: {
    defaultMessage: "Save changes",
    id: "2ebaFVw9EO",
    description: "Title of the dialog used to save global guidance",
  },
  saveDialogDescription: {
    defaultMessage: "Optionally describe what changed for version history.",
    id: "Uprf8bLGRl",
    description: "Description in the global guidance save dialog",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "CP+VovcJDY",
    description: "Button that closes the global guidance save dialog",
  },
  saveVersion: {
    defaultMessage: "Save version",
    id: "Sx9RV1pKpJ",
    description: "Button that saves a new global guidance version",
  },
  version: {
    defaultMessage: "Version {version}",
    id: "BZE2c4wFg4",
    description: "Shows the current knowledge memory version number",
  },
  addSources: {
    defaultMessage: "Add sources",
    id: "gyVhBvCqLP",
    description: "Button to return from global guidance to the source upload screen",
  },
});
