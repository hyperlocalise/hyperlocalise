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

export const visualWorkflowsPageMessages = defineMessages({
  deleteTitle: {
    defaultMessage: "Delete workflow?",
    id: "Cuem8lXjuP",
    description: "Title of the delete visual workflow confirmation dialog",
  },
  deleteDescription: {
    defaultMessage: "{workflowName} will be removed from this workspace and will no longer run.",
    id: "eQ9Hm8R7yH",
    description: "Delete visual workflow confirmation describing the selected workflow",
  },
  deleteCancel: {
    defaultMessage: "Cancel",
    id: "tDv3EqS/ae",
    description: "Cancel button in the delete visual workflow dialog",
  },
  deleting: {
    defaultMessage: "Deleting...",
    id: "A7P5XaZKlw",
    description: "Delete button label while a visual workflow is being deleted",
  },
  deleteConfirm: {
    defaultMessage: "Delete",
    id: "AXQ2DriknB",
    description: "Confirm button to delete a visual workflow",
  },
  deleteSuccess: {
    defaultMessage: "Workflow deleted",
    id: "YJKHKW9gUY",
    description: "Toast when a visual workflow is deleted successfully",
  },
  deleteFailed: {
    defaultMessage: "Could not delete this workflow.",
    id: "it5kPOtvZj",
    description: "Toast when visual workflow deletion fails",
  },
});
