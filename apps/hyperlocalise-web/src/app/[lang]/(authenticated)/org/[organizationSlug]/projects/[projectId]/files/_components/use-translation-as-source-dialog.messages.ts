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

export const useTranslationAsSourceDialogMessages = defineMessages({
  title: {
    defaultMessage: "Use translation as source",
    id: "dI5ymCilup",
    description: "Title of the dialog that sends a file's translation to another project",
  },
  description: {
    defaultMessage:
      "This file's approved translation in the chosen project's source language is sent to that project as a source file. Sending it again later updates the same strings.",
    id: "8zUnTALoPv",
    description: "Explains what sending a file's translation to another project does",
  },
  projectLabel: {
    defaultMessage: "Project",
    id: "oVwZVHATKc",
    description: "Label of the project picker in the use translation as source dialog",
  },
  projectOption: {
    defaultMessage: "{project} — {language}",
    id: "T7mc3F7zcl",
    description:
      "A project that can take this file's translation, with its source language and language code",
  },
  noDestinations: {
    defaultMessage: "No project has one of this project's languages as its source language.",
    id: "Dp1kVgZalR",
    description: "Shown when no project can take this file's translation as its source",
  },
  keepsApprovedNote: {
    defaultMessage:
      "When this text changes later, approved translations in {project} stay approved. To change this, use “When source text changes” in that project's settings.",
    id: "V2KbNrUrJg",
    description:
      "Note shown when the chosen project keeps approved translations approved after its source text changes",
  },
  notApproved: {
    defaultMessage:
      "{missingCount, plural, one {# of {totalCount} strings has} other {# of {totalCount} strings have}} no approved translation in {language} yet.",
    id: "VTqQowaju6",
    description:
      "Shown when the file cannot be sent because some strings have no approved translation",
  },
  moreMissing: {
    defaultMessage: "and {count} more",
    id: "O50a0IrZ5J",
    description: "Ends the list of strings without an approved translation when it is cut short",
  },
  readsDifferently: {
    defaultMessage:
      "This file was not sent, because the other project would not read it as the same strings. For an Excel file, the usual causes are a first-row cell that is just the name of that project's source language, a formula in that language's column, or Import filters saved without a source column. The Files guide lists the others.",
    id: "XR2kKN8gAW",
    description:
      "Shown when a file cannot be sent because the other project would split it into different strings",
  },
  notReady: {
    defaultMessage: "The file is still being read. Try again in a moment.",
    id: "AyjfFUnUax",
    description: "Shown when a file cannot be sent because its newest upload is still being read",
  },
  readFailed: {
    defaultMessage:
      "The file's newest upload could not be read. Upload the file again, then send it.",
    id: "IVRboJxVhk",
    description: "Shown when a file cannot be sent because its newest upload failed to be read",
  },
  noStrings: {
    defaultMessage: "This file has no strings to send.",
    id: "lzBzhUGbTB",
    description: "Shown when a file cannot be sent because it has no strings",
  },
  roleCannotSend: {
    defaultMessage: "Your role cannot send files to another project.",
    id: "aVCtNPy4Tq",
    description: "Shown when the person's workspace role may not send a file to another project",
  },
  loadFailed: {
    defaultMessage: "Could not load projects.",
    id: "SfNt01DHX0",
    description: "Shown when the projects that can take this file's translation fail to load",
  },
  sendFailed: {
    defaultMessage: "Could not send the file.",
    id: "cnasQ4rb/Y",
    description: "Shown when sending a file's translation to another project fails",
  },
  sendSuccess: {
    defaultMessage: "File sent to {project}.",
    id: "kVuoK77keH",
    description: "Toast after a file's translation is sent to another project as its source",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "maxFiy8OuS",
    description: "Cancel button in the use translation as source dialog",
  },
  send: {
    defaultMessage: "Send",
    id: "bh+4Gvynlp",
    description: "Button that sends a file's translation to the chosen project",
  },
});
