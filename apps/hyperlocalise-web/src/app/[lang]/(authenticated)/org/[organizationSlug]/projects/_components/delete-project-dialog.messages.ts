"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const deleteProjectDialogMessages = defineMessages({
  title: {
    defaultMessage: "Delete project?",
    id: "9u8Sq8abiS",
    description: "Title of the delete project confirmation dialog",
  },
  descriptionWithName: {
    defaultMessage:
      "{projectName} will be permanently deleted. Jobs, files, and shared context linked to it will lose their project association.",
    id: "JKFwC5ViAc",
    description: "Delete project confirmation when the project name is known",
  },
  descriptionWithoutName: {
    defaultMessage:
      "This project will be permanently deleted. Jobs, files, and shared context linked to it will lose their project association.",
    id: "qVzcsOoWpu",
    description: "Delete project confirmation when the project name is unavailable",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "qdoDJ+aaOm",
    description: "Cancel button in the delete project dialog",
  },
  deleting: {
    defaultMessage: "Deleting...",
    id: "gLjdVIWCoD",
    description: "Delete button label while a project is being deleted",
  },
  delete: {
    defaultMessage: "Delete",
    id: "aI9OdzlmW1",
    description: "Confirm button to delete a project",
  },
});
