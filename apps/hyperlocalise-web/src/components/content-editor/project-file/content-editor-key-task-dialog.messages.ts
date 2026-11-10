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

export const contentEditorKeyTaskDialogMessages = defineMessages({
  title: {
    defaultMessage: "Task for the selected strings",
    id: "GnbWa28rGR",
    description: "Title of the dialog that puts ticked strings into a task for people",
  },
  description: {
    defaultMessage:
      "{count, plural, one {The ticked string goes} other {The # ticked strings go}} into a task for people to translate and review. Hidden strings are left out.",
    id: "RqHJJ3SEei",
    description:
      "Explains what the task dialog does with the ticked strings, and how many there are",
  },
  newTask: {
    defaultMessage: "New task",
    id: "Oe7R6P8Y07",
    description: "Tab for creating a new task from the ticked strings",
  },
  existingTask: {
    defaultMessage: "Open task",
    id: "ivyviKAtVi",
    description: "Tab and label for adding the ticked strings to a task that is still open",
  },
  taskTitle: {
    defaultMessage: "Title",
    id: "VDC9TQ4+kP",
    description: "Label of the new task's title field",
  },
  languages: {
    defaultMessage: "Languages",
    id: "kTq8UVI+8c",
    description: "Label of the new task's target languages",
  },
  dueDate: {
    defaultMessage: "Due date (optional)",
    id: "eYRgoht8gt",
    description: "Label of the new task's due date",
  },
  taskDescription: {
    defaultMessage: "Description (optional)",
    id: "4QS2swi+iA",
    description: "Label of the new task's description",
  },
  chooseTask: {
    defaultMessage: "Choose a task",
    id: "xt4UbsNMQA",
    description: "Placeholder of the list of open tasks",
  },
  loadingTasks: {
    defaultMessage: "Loading open tasks…",
    id: "Tpg/i8oxA2",
    description: "Shown while the project's open tasks load",
  },
  loadTasksFailed: {
    defaultMessage: "Open tasks could not be loaded. Close the dialog and try again.",
    id: "BkBN7J1KCM",
    description: "Error when the project's open tasks fail to load",
  },
  noOpenTasks: {
    defaultMessage: "This project has no open tasks made of strings.",
    id: "yUsnrwWvgz",
    description: "Empty state when the project has no open key job",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "mg4BLrDvVd",
    description: "Closes the task dialog without changes",
  },
  create: {
    defaultMessage: "Create task",
    id: "9yzQz73cvz",
    description: "Creates a task from the ticked strings",
  },
  add: {
    defaultMessage: "Add to task",
    id: "Yd6zPnwbRD",
    description: "Adds the ticked strings to the chosen open task",
  },
  created: {
    defaultMessage: "Task created with {count, plural, one {# string} other {# strings}}",
    id: "hHB/Gn4ywj",
    description: "Toast after a task is created from ticked strings",
  },
  added: {
    defaultMessage:
      "{count, plural, =0 {The strings were already in the task} one {# string added to the task} other {# strings added to the task}}",
    id: "slTvKimPeM",
    description: "Toast after ticked strings are added to an open task",
  },
  openTask: {
    defaultMessage: "Open task",
    id: "Xw3tIk50oO",
    description: "Toast action that opens the task's page",
  },
  failed: {
    defaultMessage: "The task could not be saved",
    id: "Jhrm9Be1fa",
    description: "Fallback error when creating or adding to a task fails",
  },
  taskType: {
    defaultMessage: "Task type",
    id: "tQY42chiay",
    description:
      "Label of the choice between a task for people and AI translation of the ticked strings",
  },
  taskTypeProofread: {
    defaultMessage: "Proofread",
    id: "uuIjkOM24B",
    description: "Task type option: people translate and review the ticked strings",
  },
  taskTypeAi: {
    defaultMessage: "AI translation",
    id: "CBJ++UvPFj",
    description: "Task type option: AI translates the ticked strings in the background",
  },
  aiDescription: {
    defaultMessage:
      "{count, plural, one {The ticked string is} other {The # ticked strings are}} translated with AI in the background. Results need review. Approved translations, locked strings and hidden strings are left as they are.",
    id: "ogYglCWKZA",
    description: "Explains what AI translation does with the ticked strings",
  },
  overwriteUnapproved: {
    defaultMessage: "Also replace translations that are not approved yet",
    id: "sdQvRHgv8W",
    description:
      "Option to let AI translation replace existing translations that are not approved; by default it fills only missing ones",
  },
  translate: {
    defaultMessage: "Translate",
    id: "oa50ttNK+t",
    description: "Starts AI translation of the ticked strings",
  },
  aiTaskTitle: {
    defaultMessage: "AI translation of {count, plural, one {# string} other {# strings}}",
    id: "VYNLQ4kVv7",
    description: "Title given to the job that translates the ticked strings with AI",
  },
  aiStarted: {
    defaultMessage:
      "Translating {count, plural, one {# string} other {# strings}}. They update as each one finishes.",
    id: "eeNMn0N1Hc",
    description: "Toast after AI translation of the ticked strings starts",
  },
  openJob: {
    defaultMessage: "Open job",
    id: "XPVACICrP4",
    description: "Toast action that opens the AI translation job's page",
  },
  aiFailed: {
    defaultMessage: "AI translation could not be started",
    id: "bj4SaG8kZ2",
    description: "Fallback error when starting AI translation of the ticked strings fails",
  },
});
