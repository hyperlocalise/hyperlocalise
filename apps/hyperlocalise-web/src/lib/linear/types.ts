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
import type { PipesConnectionStatus } from "@/lib/pipes/types";

export type LinearPipesConnectionStatus = PipesConnectionStatus;

export type LinearPipesError = {
  code: "linear_pipes_unavailable" | "linear_not_connected" | "linear_pipes_needs_reauthorization";
  message: string;
};

export type LinearApiError = {
  code: "linear_credentials_invalid" | "linear_rate_limited" | "linear_request_failed";
  message: string;
  statusCode?: number;
};

export type LinearClientError = LinearPipesError | LinearApiError;

export type LinearViewer = {
  id: string;
  name: string;
  organization: { id: string; name: string; urlKey: string };
};

export type LinearTeam = {
  id: string;
  key: string;
  name: string;
};

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
};

export type LinearCreateIssueInput = {
  teamId: string;
  title: string;
  description?: string;
  labelIds?: string[];
  priority?: number;
};
