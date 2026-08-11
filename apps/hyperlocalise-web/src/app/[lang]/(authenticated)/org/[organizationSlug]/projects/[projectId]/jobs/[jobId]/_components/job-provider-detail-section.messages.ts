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

export const jobProviderDetailSectionMessages = defineMessages({
  failedToLoadAgentRuns: {
    defaultMessage: "Failed to load agent runs ({status})",
    id: "yoX7iZ3OFq",
    description: "Error when the agent runs list request fails",
  },
  failedToStartAgentRun: {
    defaultMessage: "Failed to start agent run",
    id: "E7wP6qIlhP",
    description: "Toast and error fallback when starting an agent run fails",
  },
  translationAgentRunning: {
    defaultMessage: "Translation agent is running",
    id: "Q1hlIZF0/5",
    description: "Success toast after starting a translate-with-agent run",
  },
  agentRunQueued: {
    defaultMessage: "Agent run queued",
    id: "PXuChOiobc",
    description: "Success toast after queuing a non-translate agent run",
  },
});
