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
export type AgentRunStatus =
  | "queued"
  | "planning"
  | "preparing_workspace"
  | "running"
  | "awaiting_approval"
  | "finalizing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AgentRunState = {
  id: string;
  status: AgentRunStatus;
  workflowRunId?: string | null;
  workspaceSessionId?: string | null;
};
