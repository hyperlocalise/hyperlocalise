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

export type LoopsPipesConnectionStatus = PipesConnectionStatus;

export type LoopsPipesError =
  | { code: "loops_pipes_unavailable"; message: string }
  | { code: "loops_not_connected"; message: string }
  | { code: "loops_pipes_needs_reauthorization"; message: string }
  | { code: "loops_pipes_provider_missing"; message: string }
  | { code: "loops_api_key_required"; message: string };

export type LoopsSettingsError =
  | LoopsPipesError
  | { code: "loops_credentials_invalid"; message: string }
  | { code: "loops_temporarily_unavailable"; message: string };
