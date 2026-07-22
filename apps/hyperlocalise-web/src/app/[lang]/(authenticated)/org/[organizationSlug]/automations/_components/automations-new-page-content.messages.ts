"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const automationsNewPageContentMessages = defineMessages({
  createFailed: {
    defaultMessage: "Failed to create automation",
    id: "v/lSaCxqUY",
    description: "Error when creating a workspace automation fails without an API message",
  },
  createSuccess: {
    defaultMessage: "Automation created",
    id: "7zni895OkR",
    description: "Toast when a new workspace automation is created successfully",
  },
  createError: {
    defaultMessage: "Unable to create automation right now",
    id: "sUjt/GKyKZ",
    description: "Toast when creating a workspace automation fails",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "X4qUUPKAse",
    description: "Button to cancel creating a new automation",
  },
  creating: {
    defaultMessage: "Creating...",
    id: "EavgCh3/dm",
    description: "Create button label while the automation create request is pending",
  },
  createAutomation: {
    defaultMessage: "Create automation",
    id: "45owmhJRGR",
    description: "Button to submit the new automation form",
  },
});
