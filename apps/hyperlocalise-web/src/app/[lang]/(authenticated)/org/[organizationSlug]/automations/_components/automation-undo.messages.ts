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
  undoEdit: {
    defaultMessage: "Undo changes to {target}",
    id: "6wG7FdCwWe",
    description:
      "Tooltip of the undo button for an edit; {target} is the part of the form, such as 'the name'",
  },
  redoEdit: {
    defaultMessage: "Redo changes to {target}",
    id: "jVcIZ4UejN",
    description:
      "Tooltip of the redo button for an edit; {target} is the part of the form, such as 'the name'",
  },
  undoneEdit: {
    defaultMessage: "Undid changes to {target}",
    id: "Y1PYlKOJTa",
    description:
      "Notice after an edit was undone; {target} is the part of the form, such as 'the name'",
  },
  redoneEdit: {
    defaultMessage: "Redid changes to {target}",
    id: "3qpgjnvOwr",
    description: "Notice after an undone edit was put back; {target} is the part of the form",
  },
  undoDiscard: {
    defaultMessage: "Undo discarding your changes",
    id: "LPr1xWZqN2",
    description: "Tooltip of the undo button when the latest step was the Discard changes button",
  },
  redoDiscard: {
    defaultMessage: "Discard your changes again",
    id: "FFxG82EsVF",
    description: "Tooltip of the redo button when the undone step was the Discard changes button",
  },
  undoneDiscard: {
    defaultMessage: "Brought your discarded changes back",
    id: "y+NaInUKRl",
    description: "Notice after a discard was undone",
  },
  redoneDiscard: {
    defaultMessage: "Discarded your changes again",
    id: "YiZ5ttL/m5",
    description: "Notice after an undone discard was put back",
  },
  undoReload: {
    defaultMessage: "Undo the reload of the saved automation",
    id: "L14GgyGrCO",
    description:
      "Tooltip of the undo button when the latest step replaced the form with a version saved elsewhere",
  },
  redoReload: {
    defaultMessage: "Reload the saved automation again",
    id: "USrLdmNJAO",
    description:
      "Tooltip of the redo button when the undone step replaced the form with a version saved elsewhere",
  },
  undoneReload: {
    defaultMessage: "Brought your changes back over the reloaded automation",
    id: "4YpYvVky/W",
    description: "Notice after a reload from the server was undone",
  },
  redoneReload: {
    defaultMessage: "Reloaded the saved automation again",
    id: "1X8nJDwVgi",
    description: "Notice after an undone reload was put back",
  },
  undoAssistant: {
    defaultMessage: "Undo the assistant's changes",
    id: "PoKdjDHlXP",
    description: "Tooltip of the undo button when the latest step was made by the AI assistant",
  },
  redoAssistant: {
    defaultMessage: "Redo the assistant's changes",
    id: "HohV6ugLhJ",
    description: "Tooltip of the redo button when the undone step was made by the AI assistant",
  },
  undoneAssistant: {
    defaultMessage: "Undid the assistant's changes",
    id: "UyR75G1t9n",
    description: "Notice after a step made by the AI assistant was undone",
  },
  redoneAssistant: {
    defaultMessage: "Redid the assistant's changes",
    id: "rWY8/u56v5",
    description: "Notice after an undone step made by the AI assistant was put back",
  },
  undoUnknown: {
    defaultMessage: "Undo the latest change",
    id: "3BSMwKRrgT",
    description: "Tooltip of the undo button when nothing is known about the latest step",
  },
  redoUnknown: {
    defaultMessage: "Redo the latest change",
    id: "4b19ahKIvn",
    description: "Tooltip of the redo button when nothing is known about the undone step",
  },
  undoneUnknown: {
    defaultMessage: "Undid the latest change",
    id: "hFp2azt3cq",
    description: "Notice after a step was undone when nothing is known about it",
  },
  redoneUnknown: {
    defaultMessage: "Redid the latest change",
    id: "m872VstnSl",
    description: "Notice after an undone step was put back when nothing is known about it",
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
});
