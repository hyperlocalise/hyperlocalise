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
  pageLabel: {
    defaultMessage: "Visual workflows",
    id: "BU34xLZuIV",
    description: "Breadcrumb label for the visual workflows list page",
  },
  pageTitle: {
    defaultMessage: "Visual workflows",
    id: "68KxHHw2pe",
    description: "Title for the visual workflows list page",
  },
  pageDescription: {
    defaultMessage: "Build deterministic automation graphs with triggers, actions, and branching.",
    id: "H9KS8ECUJ/",
    description: "Description for the visual workflows list page",
  },
  newWorkflow: {
    defaultMessage: "New workflow",
    id: "vj1b+ydRtP",
    description: "Button that creates a new visual workflow draft",
  },
  emptyState: {
    defaultMessage: "No visual workflows yet. Create one to start building on the canvas.",
    id: "jq/3JKwWN0",
    description: "Empty state on the visual workflows list page",
  },
  createFailed: {
    defaultMessage: "Could not create a workflow.",
    id: "Dm+YgrdmFH",
    description: "Toast when visual workflow creation fails",
  },
  deleteWorkflow: {
    defaultMessage: "Delete",
    id: "vwDelBtn01",
    description: "Button that deletes a visual workflow",
  },
  deleteTitle: {
    defaultMessage: "Delete workflow?",
    id: "vwDelTtl02",
    description: "Title of the delete visual workflow confirmation dialog",
  },
  deleteDescription: {
    defaultMessage: "{workflowName} will be removed from this workspace and will no longer run.",
    id: "vwDelDsc03",
    description: "Delete visual workflow confirmation describing the selected workflow",
  },
  deleteCancel: {
    defaultMessage: "Cancel",
    id: "vwDelCan04",
    description: "Cancel button in the delete visual workflow dialog",
  },
  deleting: {
    defaultMessage: "Deleting...",
    id: "vwDelIng05",
    description: "Delete button label while a visual workflow is being deleted",
  },
  deleteConfirm: {
    defaultMessage: "Delete",
    id: "vwDelCfm06",
    description: "Confirm button to delete a visual workflow",
  },
  deleteSuccess: {
    defaultMessage: "Workflow deleted",
    id: "vwDelOk07",
    description: "Toast when a visual workflow is deleted successfully",
  },
  deleteFailed: {
    defaultMessage: "Could not delete this workflow.",
    id: "vwDelErr08",
    description: "Toast when visual workflow deletion fails",
  },
});
