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
    defaultMessage: "Advanced workflows",
    id: "BU34xLZuIV",
    description: "Breadcrumb label for the visual workflows list page",
  },
  pageTitle: {
    defaultMessage: "Advanced workflows",
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
    defaultMessage: "No advanced workflows yet. Create one to start building on the canvas.",
    id: "jq/3JKwWN0",
    description: "Empty state on the visual workflows list page",
  },
  createFailed: {
    defaultMessage: "Could not create a workflow.",
    id: "Dm+YgrdmFH",
    description: "Toast when visual workflow creation fails",
  },
});
