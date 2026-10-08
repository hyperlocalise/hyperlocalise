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

export const automationUndoMessages = defineMessages({
  undo: {
    defaultMessage: "Undo",
    id: "g3PqpCejL+",
    description: "Accessible name of the button that takes back the latest change to an automation",
  },
  redo: {
    defaultMessage: "Redo",
    id: "XlLg7tU4UB",
    description:
      "Accessible name of the button that puts back the latest undone change to an automation",
  },
  undoWithChange: {
    defaultMessage: "Undo {change}",
    id: "dYfQlg3O2D",
    description:
      "Tooltip of the undo button; {change} names what would be undone, such as 'the name'",
  },
  redoWithChange: {
    defaultMessage: "Redo {change}",
    id: "Sbm+OevS9G",
    description:
      "Tooltip of the redo button; {change} names what would be redone, such as 'the name'",
  },
  undone: {
    defaultMessage: "Undid {change}",
    id: "AWcaoqXnin",
    description:
      "Notice after a change to an automation was undone; {change} names it, such as 'the name'",
  },
  redone: {
    defaultMessage: "Redid {change}",
    id: "325avIw6Rg",
    description: "Notice after an undone change to an automation was put back; {change} names it",
  },
  redoHint: {
    defaultMessage: "Press {shortcut} to redo",
    id: "UqKynWrYMs",
    description: "Hint under the undo notice naming the keyboard shortcut that redoes",
  },
  undoHint: {
    defaultMessage: "Press {shortcut} to undo",
    id: "n3x9N/b/Js",
    description: "Hint under the redo notice naming the keyboard shortcut that undoes",
  },
  changeName: {
    defaultMessage: "the name",
    id: "Hlv8AAHxdT",
    description: "What an undo step changed, used in 'Undo {change}' and 'Undid {change}'",
  },
  changeInstructions: {
    defaultMessage: "the instructions",
    id: "5jQpxYwr3e",
    description: "What an undo step changed, used in 'Undo {change}' and 'Undid {change}'",
  },
  changeStatus: {
    defaultMessage: "the status",
    id: "wMco7sbdHi",
    description: "What an undo step changed, used in 'Undo {change}' and 'Undid {change}'",
  },
  changeModel: {
    defaultMessage: "the model",
    id: "rz4L13auz1",
    description: "What an undo step changed, used in 'Undo {change}' and 'Undid {change}'",
  },
  changeProject: {
    defaultMessage: "the project",
    id: "3NiEPa2gwT",
    description: "What an undo step changed, used in 'Undo {change}' and 'Undid {change}'",
  },
  changeTrigger: {
    defaultMessage: "the trigger",
    id: "4HX2beF1U5",
    description: "What an undo step changed, used in 'Undo {change}' and 'Undid {change}'",
  },
  changeSchedule: {
    defaultMessage: "the schedule",
    id: "HbhX7yojwm",
    description: "What an undo step changed, used in 'Undo {change}' and 'Undid {change}'",
  },
  changeSkills: {
    defaultMessage: "the skills",
    id: "b0Mnso+YSR",
    description: "What an undo step changed, used in 'Undo {change}' and 'Undid {change}'",
  },
  changeTools: {
    defaultMessage: "the tools",
    id: "584/OLp2LZ",
    description: "What an undo step changed, used in 'Undo {change}' and 'Undid {change}'",
  },
  changeSync: {
    defaultMessage: "the sync settings",
    id: "B8zWPVBH7U",
    description: "What an undo step changed, used in 'Undo {change}' and 'Undid {change}'",
  },
  changeSettings: {
    defaultMessage: "the settings",
    id: "IHytImbzyr",
    description: "What an undo step changed when no closer name fits, used in 'Undo {change}'",
  },
  changeDiscard: {
    defaultMessage: "discarding your changes",
    id: "rXGHzTBLiV",
    description: "The undo step made by the Discard changes button, used in 'Undo {change}'",
  },
  changeReload: {
    defaultMessage: "the reload of the saved automation",
    id: "zsmFELUe7T",
    description:
      "The undo step made when the saved automation changed on the server and replaced the form",
  },
  changeAssistant: {
    defaultMessage: "the assistant's changes",
    id: "iL0t3BuH4s",
    description: "The undo step made by the AI assistant's reply, used in 'Undo {change}'",
  },
  changeUnknown: {
    defaultMessage: "the latest change",
    id: "8e8E9aoNPH",
    description:
      "What an undo step changed when nothing is known about it, used in 'Undo {change}'",
  },
});
