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
"use client";

import { defineMessages } from "react-intl";

export const timeTabMessages = defineMessages({
  timeLogged: {
    id: "TPSJDoFsCd",
    defaultMessage: "Time logged",
    description: "Time card: time people logged in the dates",
  },
  peopleWhoLogged: {
    id: "ZyLqw2lEMQ",
    defaultMessage: "People who logged time",
    description: "Time card: how many people logged time",
  },
  acrossTasks: {
    id: "EerPW4bY0Q",
    defaultMessage: "{count, plural, one {Across # task} other {Across # tasks}}",
    description: "Detail under the people card: how many tasks the time was logged on",
  },
  automatedTime: {
    id: "0qOhoeNpmX",
    defaultMessage: "Automated step run time",
    description: "Time card: how long automated steps ran",
  },
  runs: {
    id: "p5EM7xOnW0",
    defaultMessage: "{count, plural, one {# run} other {# runs}}",
    description: "Detail under the automated time card",
  },
  logTime: {
    id: "H3ZP4+H6tz",
    defaultMessage: "Log time",
    description: "Button that opens the dialog for logging time",
  },
  taskColumn: {
    id: "lr+kB76/+I",
    defaultMessage: "Task",
    description: "Column heading: the task",
  },
  stepColumn: {
    id: "G483RkGMWe",
    defaultMessage: "Step",
    description: "Column heading: the step",
  },
  languageColumn: {
    id: "wNTnMH8vtk",
    defaultMessage: "Language",
    description: "Column heading: the target language",
  },
  timeColumn: {
    id: "AJN5fd5AW+",
    defaultMessage: "Time logged",
    description: "Column heading: time logged",
  },
  peopleColumn: {
    id: "xbjKfHbYFk",
    defaultMessage: "People",
    description: "Column heading: how many people logged time",
  },
  deletedTask: {
    id: "ij6kzC+n43",
    defaultMessage: "Deleted task",
    description: "A task that no longer exists",
  },
  tableLabel: {
    id: "1rHVQY/CHQ",
    defaultMessage: "Time logged by task",
    description: "Accessible name of the logged time table",
  },
  noTime: {
    id: "e9TWkneAZC",
    defaultMessage: "No time was logged in these dates.",
    description: "Shown when nobody logged time",
  },
  dialogTitle: {
    id: "QPwbASMJqd",
    defaultMessage: "Log time",
    description: "Title of the dialog for logging time",
  },
  dialogDescription: {
    id: "hniRYSMwhV",
    defaultMessage:
      "Record time spent on a task. You can change or remove your entries from the task's report.",
    description: "Description in the log time dialog",
  },
  chooseTask: {
    id: "b8a5Sr5a3d",
    defaultMessage: "Choose a task",
    description: "Placeholder of the task field in the log time dialog",
  },
  chooseLanguage: {
    id: "TMFHZf5Az+",
    defaultMessage: "Choose a language",
    description: "Placeholder of the language field in the log time dialog",
  },
  date: {
    id: "7hvZqJJjAI",
    defaultMessage: "Date",
    description: "Label of the date the work was done",
  },
  hours: {
    id: "AdNDYojW5A",
    defaultMessage: "Hours",
    description: "Label of the hours field",
  },
  minutes: {
    id: "PGHBaJsXHq",
    defaultMessage: "Minutes",
    description: "Label of the minutes field",
  },
  note: {
    id: "WeOIzTovo9",
    defaultMessage: "Note",
    description: "Label of the optional note",
  },
  cancel: {
    id: "Qo+4S7AuZj",
    defaultMessage: "Cancel",
    description: "Button that closes the dialog without saving",
  },
  save: {
    id: "XgEDOt4cQC",
    defaultMessage: "Log time",
    description: "Button that saves the logged time",
  },
  saving: {
    id: "YIv/dr38bc",
    defaultMessage: "Saving…",
    description: "Button text while logged time is saved",
  },
  saved: {
    id: "/+Kr0bkslO",
    defaultMessage: "Time logged.",
    description: "Message shown after time is logged",
  },
  taskRequired: {
    id: "b3IZauSeGB",
    defaultMessage: "Choose a task.",
    description: "Error when no task is chosen",
  },
  languageRequired: {
    id: "5L/KNEfl5D",
    defaultMessage: "Choose a language.",
    description: "Error when no language is chosen",
  },
  durationInvalid: {
    id: "H2mYTcpmxu",
    defaultMessage: "Enter between 1 minute and 24 hours.",
    description: "Error when the time is out of range",
  },
  nativeTaskRequired: {
    id: "FdGIEFoVOm",
    defaultMessage: "Time can only be logged on tasks created in Hyperlocalise.",
    description: "Error when time is logged on a task from a connected TMS",
  },
});
