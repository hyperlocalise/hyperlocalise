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

import type { BrazeRestEndpoint } from "./constants";

export type BrazePipesConnectionStatus = PipesConnectionStatus;

export type BrazeConnectionSettings = {
  restEndpoint: BrazeRestEndpoint;
};

export type BrazePipesError =
  | { code: "braze_pipes_unavailable"; message: string }
  | { code: "braze_not_connected"; message: string }
  | { code: "braze_pipes_needs_reauthorization"; message: string }
  | { code: "braze_api_key_required"; message: string };

export type BrazeSettingsError =
  | BrazePipesError
  | { code: "braze_endpoint_missing"; message: string }
  | { code: "braze_endpoint_invalid"; message: string };
