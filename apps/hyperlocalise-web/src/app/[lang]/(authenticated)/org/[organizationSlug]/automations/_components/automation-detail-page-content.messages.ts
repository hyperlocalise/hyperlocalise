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

export const automationDetailPageContentMessages = defineMessages({
  updateSuccess: {
    defaultMessage: "Automation updated",
    id: "TqKPfOkj7i",
    description: "Toast when a workspace automation is saved successfully",
  },
  updateError: {
    defaultMessage: "Unable to save automation right now",
    id: "YzNLnailQi",
    description: "Toast when saving a workspace automation fails",
  },
  runQueued: {
    defaultMessage: "Manual run queued",
    id: "pMNkzc+47V",
    description: "Toast when a manual automation run is queued successfully",
  },
  runError: {
    defaultMessage: "Unable to queue a manual run right now",
    id: "6zAmu9E3FT",
    description: "Toast when queueing a manual automation run fails",
  },
  loading: {
    defaultMessage: "Loading automation...",
    id: "YGyu9mb0BB",
    description: "Loading state while an automation detail page is fetching",
  },
  runNow: {
    defaultMessage: "Run now",
    id: "P5eC/nlEOZ",
    description: "Button to queue a manual automation run",
  },
  saving: {
    defaultMessage: "Saving...",
    id: "4mzmyHsHW0",
    description: "Save button label while the automation update request is pending",
  },
  saveChanges: {
    defaultMessage: "Save changes",
    id: "F6jskX12It",
    description: "Button to save automation detail changes",
  },
  backToAutomations: {
    defaultMessage: "Back to automations",
    id: "aEJ2kyKHZN",
    description: "Link back to the workspace automations list",
  },
});
